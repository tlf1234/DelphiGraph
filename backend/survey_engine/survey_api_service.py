"""
Survey Engine — 路由已迁移至 survey_router.py
由 backend/api_service.py 通过 app.include_router() 统一挂载，
与因果分析路由共用同一进程和端口，无需独立服务。

路由注册位置：
  backend/api_service.py → app.include_router(survey_router.router)

如需独立部署（未来扩展），可参考此文件历史记录重建。
"""
