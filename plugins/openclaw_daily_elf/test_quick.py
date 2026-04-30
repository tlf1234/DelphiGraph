#!/usr/bin/env python3
# 快速测试脚本 - 验证代码修复

import sys
import importlib.util

def test_import():
    """测试能否正常导入模块"""
    try:
        spec = importlib.util.spec_from_file_location("daily_elf_runner", "daily-elf-runner.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        print("✅ 模块导入成功")
        return True
    except Exception as e:
        print(f"❌ 模块导入失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_function_exists():
    """测试关键函数是否存在"""
    try:
        spec = importlib.util.spec_from_file_location("daily_elf_runner", "daily-elf-runner.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        # 检查关键函数
        assert hasattr(module, 'send_message_to_openclaw'), "缺少 send_message_to_openclaw 函数"
        assert hasattr(module, 'create_analysis_task'), "缺少 create_analysis_task 函数"
        assert hasattr(module, 'main'), "缺少 main 函数"
        
        print("✅ 所有关键函数存在")
        return True
    except Exception as e:
        print(f"❌ 函数检查失败: {e}")
        return False

def test_create_analysis_task():
    """测试 create_analysis_task 函数"""
    try:
        spec = importlib.util.spec_from_file_location("daily_elf_runner", "daily-elf-runner.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        # 测试函数调用
        task = "测试任务"
        result = module.create_analysis_task(task)
        
        assert isinstance(result, str), "返回值应该是字符串"
        assert "测试任务" in result, "返回值应该包含任务描述"
        assert "智能分析任务" in result, "返回值应该包含任务标题"
        
        print("✅ create_analysis_task 函数正常工作")
        print(f"   生成的消息长度: {len(result)} 字符")
        return True
    except Exception as e:
        print(f"❌ create_analysis_task 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("🧪 开始快速测试...\n")
    
    results = []
    results.append(("模块导入", test_import()))
    results.append(("函数存在性", test_function_exists()))
    results.append(("create_analysis_task", test_create_analysis_task()))
    
    print("\n" + "="*50)
    print("测试结果汇总:")
    print("="*50)
    
    for name, passed in results:
        status = "✅ 通过" if passed else "❌ 失败"
        print(f"{name}: {status}")
    
    all_passed = all(result[1] for result in results)
    
    print("="*50)
    if all_passed:
        print("🎉 所有测试通过！代码修复成功！")
        sys.exit(0)
    else:
        print("⚠️  部分测试失败，请检查代码")
        sys.exit(1)
