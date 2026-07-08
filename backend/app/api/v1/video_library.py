import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.lesson_plan import VideoLibraryCreate, VideoLibraryRead, VideoLibraryUpdate
from app.services import video as video_service

router = APIRouter(tags=["video-library"])


@router.get("/api/v1/video-library", response_model=list[VideoLibraryRead])
async def list_videos(
    source: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    videos = await video_service.list_videos(db, source, search, company_id=current_user.company_id)
    return [VideoLibraryRead.model_validate(v) for v in videos]


@router.post("/api/v1/video-library", response_model=VideoLibraryRead, status_code=201)
async def create_video(
    data: VideoLibraryCreate,
    lesson_id: str | None = Query(None, description="Auto-link to this lesson"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video = await video_service.create_video(
        db,
        title=data.title,
        source=data.source,
        url=data.url,
        duration_seconds=data.duration_seconds,
        thumbnail_url=data.thumbnail_url,
        qr_code_data=data.qr_code_data,
        created_by_phone=current_user.phone,
        company_id=current_user.company_id,
    )
    if lesson_id:
        try:
            lid = uuid.UUID(lesson_id)
            await video_service.attach_video_to_lesson(db, lid, video.id)
        except ValueError:
            pass
    return VideoLibraryRead.model_validate(video)


@router.post("/api/v1/video-library/upload", response_model=VideoLibraryRead, status_code=201)
async def upload_video(
    title: str = Form(...),
    lesson_id: str = Form(""),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed_types = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"]
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unsupported video type: {file.content_type}")

    max_size = 500 * 1024 * 1024  # 500MB
    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)
    if size > max_size:
        raise HTTPException(status_code=400, detail="File too large (max 500MB)")

    video = await video_service.upload_video_file(db, title, file, created_by_phone=current_user.phone, company_id=current_user.company_id)
    if lesson_id:
        try:
            lid = uuid.UUID(lesson_id)
            await video_service.attach_video_to_lesson(db, lid, video.id)
        except ValueError:
            pass
    return VideoLibraryRead.model_validate(video)


@router.get("/api/v1/video-library/{video_id}", response_model=VideoLibraryRead)
async def get_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        vid = uuid.UUID(video_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid video ID")
    video = await video_service.get_video_by_id(db, vid, company_id=current_user.company_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return VideoLibraryRead.model_validate(video)


@router.patch("/api/v1/video-library/{video_id}", response_model=VideoLibraryRead)
async def update_video(
    video_id: str,
    data: VideoLibraryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        vid = uuid.UUID(video_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid video ID")
    video = await video_service.get_video_by_id(db, vid, company_id=current_user.company_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    updated = await video_service.update_video(
        db, video,
        title=data.title,
        url=data.url,
        duration_seconds=data.duration_seconds,
        thumbnail_url=data.thumbnail_url,
        qr_code_data=data.qr_code_data,
    )
    return VideoLibraryRead.model_validate(updated)


@router.delete("/api/v1/video-library/{video_id}", status_code=204)
async def delete_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        vid = uuid.UUID(video_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid video ID")
    video = await video_service.get_video_by_id(db, vid, company_id=current_user.company_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    await video_service.delete_video(db, video)


@router.get("/api/v1/video-library/{video_id}/stream")
async def stream_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        vid = uuid.UUID(video_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid video ID")
    video = await video_service.get_video_by_id(db, vid, company_id=current_user.company_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # If YouTube/Vimeo, redirect to the URL
    if video.source.value in ("youtube", "vimeo") and video.url:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=video.url, status_code=302)

    # Stream uploaded file — Starlette's FileResponse handles Range headers natively
    file_path = await video_service.get_video_file_path(video)
    if not file_path:
        raise HTTPException(status_code=404, detail="Video file not found on disk")

    mime_type = video.mime_type or "video/mp4"
    filename = os.path.basename(file_path)
    return FileResponse(
        path=file_path,
        media_type=mime_type,
        filename=filename,
        headers={"Accept-Ranges": "bytes"},
    )
