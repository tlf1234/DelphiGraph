#!/bin/bash

# AgentOracle 数据库迁移脚本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查Supabase CLI
check_supabase_cli() {
    if ! command -v supabase &> /dev/null; then
        log_error "Supabase CLI未安装"
        log_info "安装方法: https://supabase.com/docs/guides/cli"
        exit 1
    fi
}

# 检查项目连接
check_project_link() {
    if ! supabase status &> /dev/null; then
        log_error "未连接到Supabase项目"
        log_info "运行: supabase link --project-ref YOUR_PROJECT_REF"
        exit 1
    fi
}

# 显示待迁移的更改
show_pending_changes() {
    log_info "检查待迁移的更改..."
    
    if supabase db diff | grep -q "No schema changes detected"; then
        log_info "没有待迁移的更改"
        return 1
    else
        log_warn "检测到以下更改:"
        supabase db diff
        return 0
    fi
}

# 创建新迁移
create_migration() {
    local migration_name=$1
    
    if [ -z "$migration_name" ]; then
        log_error "请提供迁移名称"
        echo "用法: $0 create <migration_name>"
        exit 1
    fi
    
    log_info "创建新迁移: $migration_name"
    supabase migration new "$migration_name"
    
    log_info "迁移文件已创建"
}

# 应用迁移
apply_migrations() {
    log_info "应用数据库迁移..."
    
    # 显示待迁移的更改
    if ! show_pending_changes; then
        return
    fi
    
    # 确认
    read -p "确认应用这些更改? (y/N) " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warn "迁移已取消"
        exit 0
    fi
    
    # 应用迁移
    supabase db push || {
        log_error "迁移失败"
        exit 1
    }
    
    log_info "迁移成功"
}

# 回滚迁移
rollback_migration() {
    log_warn "回滚最后一次迁移..."
    
    # 确认
    read -p "确认回滚? 这将撤销最后一次迁移 (y/N) " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warn "回滚已取消"
        exit 0
    fi
    
    # 回滚
    supabase migration down || {
        log_error "回滚失败"
        exit 1
    }
    
    log_info "回滚成功"
}

# 重置数据库
reset_database() {
    log_error "警告: 这将删除所有数据并重新应用所有迁移!"
    
    # 确认
    read -p "确认重置数据库? 输入 'RESET' 确认: " confirm
    
    if [ "$confirm" != "RESET" ]; then
        log_warn "重置已取消"
        exit 0
    fi
    
    log_warn "重置数据库..."
    supabase db reset || {
        log_error "重置失败"
        exit 1
    }
    
    log_info "数据库已重置"
}

# 备份数据库
backup_database() {
    local backup_file="backup_$(date +%Y%m%d_%H%M%S).sql"
    
    log_info "备份数据库到: $backup_file"
    
    supabase db dump -f "$backup_file" || {
        log_error "备份失败"
        exit 1
    }
    
    log_info "备份成功: $backup_file"
}

# 恢复数据库
restore_database() {
    local backup_file=$1
    
    if [ -z "$backup_file" ]; then
        log_error "请提供备份文件路径"
        echo "用法: $0 restore <backup_file>"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "备份文件不存在: $backup_file"
        exit 1
    fi
    
    log_warn "恢复数据库从: $backup_file"
    
    # 确认
    read -p "确认恢复? 这将覆盖当前数据 (y/N) " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warn "恢复已取消"
        exit 0
    fi
    
    # 恢复
    psql -f "$backup_file" || {
        log_error "恢复失败"
        exit 1
    }
    
    log_info "恢复成功"
}

# 显示帮助
show_help() {
    echo "AgentOracle 数据库迁移脚本"
    echo ""
    echo "用法: $0 <command> [options]"
    echo ""
    echo "命令:"
    echo "  status              显示当前状态"
    echo "  diff                显示待迁移的更改"
    echo "  create <name>       创建新迁移"
    echo "  apply               应用所有待迁移的更改"
    echo "  rollback            回滚最后一次迁移"
    echo "  reset               重置数据库（删除所有数据）"
    echo "  backup              备份数据库"
    echo "  restore <file>      从备份恢复数据库"
    echo "  help                显示此帮助信息"
    echo ""
}

# 主函数
main() {
    check_supabase_cli
    check_project_link
    
    case "${1:-help}" in
        status)
            supabase status
            ;;
        diff)
            show_pending_changes || log_info "没有待迁移的更改"
            ;;
        create)
            create_migration "$2"
            ;;
        apply)
            apply_migrations
            ;;
        rollback)
            rollback_migration
            ;;
        reset)
            reset_database
            ;;
        backup)
            backup_database
            ;;
        restore)
            restore_database "$2"
            ;;
        help|*)
            show_help
            ;;
    esac
}

main "$@"
