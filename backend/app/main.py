from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    auth, cart, clients, commission, companies, consultations, finance,
    fuel,
    instructor_qualifications,
    lesson_plan, lesson_execution, library, packages, payments, permit,
    products, receipts, reports, schedule_breaks, scheduling, training, users,
    vehicle_assignments, vehicle_schedule, vehicles, video_library,
)
from app.core.config import settings

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(packages.router, prefix="/api/v1")
app.include_router(consultations.router, prefix="/api/v1")
app.include_router(clients.router)
app.include_router(cart.router)
app.include_router(payments.router)
app.include_router(training.router, prefix="/api/v1")
app.include_router(training.schedule_router, prefix="/api/v1")
app.include_router(permit.router, prefix="/api/v1")
app.include_router(lesson_plan.router)
app.include_router(library.router)
app.include_router(video_library.router)
app.include_router(lesson_execution.router)
app.include_router(vehicles.router)
app.include_router(vehicle_assignments.router)
app.include_router(vehicle_schedule.router)
app.include_router(scheduling.router)
app.include_router(instructor_qualifications.router)
app.include_router(companies.router)
app.include_router(commission.router, prefix="/api/v1")
app.include_router(finance.router, prefix="/api/v1")
app.include_router(fuel.router, prefix="/api/v1")
app.include_router(receipts.router)
app.include_router(reports.router, prefix="/api/v1")
app.include_router(schedule_breaks.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
