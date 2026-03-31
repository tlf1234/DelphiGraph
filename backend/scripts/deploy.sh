#!/bin/bash

# AgentOracle 部署脚本
# 用于自动化部署流程

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查必要的命令
check_dependencies() {
    log_info "检查依赖..."
    
    commands=("node" "npm" "supabase" "vercel")
    for cmd in "${commands[@]}"; do
        if ! command -v $cmd &> /dev/null; then
            log_error "$cmd 未安装"
            exit 1
        fi
    done
    
    log_info "所有依赖已安装"
}

# 检查环境变量
check_env_vars() {
    log_info "检查环境变量..."
    
    required_vars=(
        "NEXT_PUBLIC_SUPABASE_URL"
        "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "环境变量 $var 未设置"
            exit 1
        fi
    done
    
    log_info "环境变量检查通过"
}

# 运行测试
run_tests() {
    log_info "运行测试..."
    
    # 运行TypeScript类型检查
    npm run type-check || {
        log_error "TypeScript类型检查失败"
        exit 1
    }
    
    # 运行linter
    npm run lint || {
        log_error "Linter检查失败"
        exit 1
    }
    
    log_info "所有测试通过"
}

# 构建项目
build_project() {
    log_info "构建项目..."
    
    npm run build || {
        log_error "构建失败"
        exit 1
    }
    
    log_info "构建成功"
}

# 部署数据库迁移
deploy_migrations() {
    log_info "部署数据库迁移..."
    
    # 检查是否有待迁移的更改
    if supabase db diff | grep -q "No schema changes detected"; then
        log_info "没有待迁移的数据库更改"
    else
        log_warn "检测到数据库更改，开始迁移..."
        
        # 推送迁移
        supabase db push || {
            log_error "数据库迁移失败"
            exit 1
        }
        
        log_info "数据库迁移成功"
    fi
}

# 部署Edge Functions
deploy_functions() {
    log_info "部署Edge Functions..."
    
    # 获取所有函数目录
    functions_dir="supabase/functions"
    
    if [ ! -d "$functions_dir" ]; then
        log_warn "未找到Edge Functions目录"
        return
    fi
    
    # 部署每个函数
    for func_dir in "$functions_dir"/*; do
        if [ -d "$func_dir" ] && [ ! -d "$func_dir/_shared" ]; then
            func_name=$(basename "$func_dir")
            log_info "部署函数: $func_name"
            
            supabase functions deploy "$func_name" || {
                log_error "函数 $func_name 部署失败"
                exit 1
            }
        fi
    done
    
    log_info "所有Edge Functions部署成功"
}

# 部署到Vercel
deploy_vercel() {
    log_info "部署到Vercel..."
    
    if [ "$1" == "production" ]; then
        log_info "部署到生产环境..."
        vercel --prod || {
            log_error "Vercel生产部署失败"
            exit 1
        }
    else
        log_info "部署到预览环境..."
        vercel || {
            log_error "Vercel预览部署失败"
            exit 1
        }
    fi
    
    log_info "Vercel部署成功"
}

# 验证部署
verify_deployment() {
    log_info "验证部署..."
    
    # 获取部署URL
    deployment_url=$(vercel ls --json | jq -r '.[0].url')
    
    if [ -z "$deployment_url" ]; then
        log_error "无法获取部署URL"
        exit 1
    fi
    
    log_info "部署URL: https://$deployment_url"
    
    # 检查网站是否可访问
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "https://$deployment_url")
    
    if [ "$http_code" == "200" ]; then
        log_info "网站可访问 (HTTP $http_code)"
    else
        log_error "网站无法访问 (HTTP $http_code)"
        exit 1
    fi
    
    log_info "部署验证成功"
}

# 主函数
main() {
    log_info "开始部署AgentOracle..."
    
    # 解析参数
    environment=${1:-preview}
    
    if [ "$environment" != "production" ] && [ "$environment" != "preview" ]; then
        log_error "无效的环境: $environment (使用 'production' 或 'preview')"
        exit 1
    fi
    
    log_info "部署环境: $environment"
    
    # 执行部署步骤
    check_dependencies
    check_env_vars
    run_tests
    build_project
    deploy_migrations
    deploy_functions
    deploy_vercel "$environment"
    verify_deployment
    
    log_info "✅ 部署完成！"
}

# 运行主函数
main "$@"
