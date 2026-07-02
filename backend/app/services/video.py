import os
import uuid
from datetime import datetime

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lesson_plan import LessonLibrary, LessonLibraryVideo, VideoLibrary, VideoSource

UPLOAD_DIR = "uploads/videos"


async def ensure_upload_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


async def create_video(
    db: AsyncSession,
    title: str,
    source: str,
    url: str | None = None,
    duration_seconds: int | None = None,
    thumbnail_url: str | None = None,
    qr_code_data: str | None = None,
    file_path: str | None = None,
    file_size: int | None = None,
    mime_type: str | None = None,
    created_by_phone: str | None = None,
) -> VideoLibrary:
    video = VideoLibrary(
        title=title,
        source=VideoSource(source),
        url=url,
        file_path=file_path,
        file_size=file_size,
        mime_type=mime_type,
        duration_seconds=duration_seconds,
        thumbnail_url=thumbnail_url,
        qr_code_data=qr_code_data,
        created_by_phone=created_by_phone,
    )
    db.add(video)
    await db.flush()
    await db.refresh(video)
    return video


async def upload_video_file(
    db: AsyncSession,
    title: str,
    file: UploadFile,
    created_by_phone: str | None = None,
) -> VideoLibrary:
    await ensure_upload_dir()

    ext = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
    filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    file_size = len(content)

    with open(file_path, "wb") as f:
        f.write(content)

    # Detect MIME type from extension if content_type is unreliable
    ext_map = {".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".avi": "video/x-msvideo"}
    mime_type = file.content_type or ext_map.get(ext, "video/mp4")

    video = VideoLibrary(
        title=title,
        source=VideoSource.UPLOAD,
        file_path=file_path,
        file_size=file_size,
        mime_type=mime_type,
        created_by_phone=created_by_phone,
    )
    db.add(video)
    await db.flush()
    await db.refresh(video)
    return video


async def get_video_by_id(
    db: AsyncSession, video_id: uuid.UUID
) -> VideoLibrary | None:
    result = await db.execute(
        select(VideoLibrary).where(VideoLibrary.id == video_id)
    )
    return result.scalar_one_or_none()


async def list_videos(
    db: AsyncSession, source: str | None = None, search: str | None = None
) -> list[VideoLibrary]:
    query = select(VideoLibrary).order_by(VideoLibrary.created_at.desc())
    if source:
        query = query.where(VideoLibrary.source == VideoSource(source))
    if search:
        query = query.where(VideoLibrary.title.ilike(f"%{search}%"))
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_video(
    db: AsyncSession,
    video: VideoLibrary,
    title: str | None = None,
    url: str | None = None,
    duration_seconds: int | None = None,
    thumbnail_url: str | None = None,
    qr_code_data: str | None = None,
) -> VideoLibrary:
    if title is not None:
        video.title = title
    if url is not None:
        video.url = url
    if duration_seconds is not None:
        video.duration_seconds = duration_seconds
    if thumbnail_url is not None:
        video.thumbnail_url = thumbnail_url
    if qr_code_data is not None:
        video.qr_code_data = qr_code_data
    await db.flush()
    await db.refresh(video)
    return video


async def delete_video(db: AsyncSession, video: VideoLibrary) -> None:
    # Remove file if uploaded
    if video.file_path and os.path.exists(video.file_path):
        os.remove(video.file_path)
    await db.delete(video)
    await db.flush()


async def attach_video_to_lesson(db: AsyncSession, lesson_id: uuid.UUID, video_id: uuid.UUID) -> None:
    # Check link doesn't already exist
    result = await db.execute(
        select(LessonLibraryVideo).where(
            LessonLibraryVideo.lesson_id == lesson_id,
            LessonLibraryVideo.video_id == video_id,
        )
    )
    if result.scalar_one_or_none():
        return  # Already linked
    # Get next order value
    max_order = await db.execute(
        select(LessonLibraryVideo.order)
        .where(LessonLibraryVideo.lesson_id == lesson_id)
        .order_by(LessonLibraryVideo.order.desc())
        .limit(1)
    )
    next_order = (max_order.scalar_one_or_none() or -1) + 1
    link = LessonLibraryVideo(lesson_id=lesson_id, video_id=video_id, order=next_order)
    db.add(link)
    await db.flush()


async def get_video_file_path(video: VideoLibrary) -> str | None:
    if video.source == VideoSource.UPLOAD and video.file_path:
        # Resolve absolute path from app root
        app_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
        # Try relative to upload dir
        rel_path = os.path.join(UPLOAD_DIR, os.path.basename(video.file_path))
        for candidate in [rel_path, video.file_path, os.path.join(app_root, rel_path), os.path.join(app_root, video.file_path)]:
            abs_path = os.path.abspath(candidate)
            if os.path.exists(abs_path):
                return abs_path
    return None
