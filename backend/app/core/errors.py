import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

HTTP_ERROR_MESSAGES = {
    404: "요청한 주소를 찾을 수 없습니다.",
    405: "허용되지 않는 요청 방식입니다.",
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        # FastAPI의 HTTPException과 라우트 없음(404)·메서드 불가(405)를 같은 형식으로 응답한다.
        if isinstance(exc.detail, str) and exc.status_code not in HTTP_ERROR_MESSAGES:
            message = exc.detail
        else:
            message = HTTP_ERROR_MESSAGES.get(exc.status_code, "요청을 처리하지 못했습니다.")
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": "http_error", "message": message}},
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, __: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "입력값을 다시 확인해 주세요.",
                }
            },
        )

    @app.exception_handler(Exception)
    async def unexpected_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        # 내부 예외 내용과 요청 본문은 응답과 로그에 남기지 않는다.
        logger.error("Unhandled %s on %s %s", type(exc).__name__, request.method, request.url.path)
        # 이 핸들러는 CORS 미들웨어 바깥에서 실행되므로 허용된 출처에만 직접 헤더를 붙인다.
        headers: dict[str, str] = {}
        origin = request.headers.get("origin")
        if origin and origin in request.app.state.settings.allowed_origins:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Vary"] = "Origin"
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
                }
            },
            headers=headers,
        )
