"""
causal_engine/api_service.py  兼容转发层

真正的 API 服务入口已移至 backend/api_service.py。
此文件保留以兼容任何仍通过 causal_engine.api_service 引用的代码。
"""
from api_service import (  # noqa: F401
    app,
    main,
    run_analysis_for_market,
    polling_loop,
)
