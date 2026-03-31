#!/usr/bin/env node

/**
 * DelphiGraph 设置验证脚本
 * 检查项目配置是否正确
 */

const fs = require('fs')
const path = require('path')

console.log('🔍 DelphiGraph 设置验证\n')

let hasErrors = false

// 检查必需文件
const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'next.config.js',
  'tailwind.config.ts',
  '.env.example',
  'app/layout.tsx',
  'app/page.tsx',
  'lib/supabase/client.ts',
  'lib/supabase/server.ts',
  'supabase/migrations/20240213000001_initial_schema.sql',
  'supabase/migrations/20240213000002_rls_policies.sql',
]

console.log('📁 检查必需文件...')
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`)
  } else {
    console.log(`  ❌ ${file} - 缺失`)
    hasErrors = true
  }
})

// 检查环境变量
console.log('\n🔐 检查环境变量...')
const envExample = fs.readFileSync('.env.example', 'utf8')
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

const optionalEnvVars = [
  'QWEN_API_KEY',
  'OPENAI_API_KEY',
]

requiredEnvVars.forEach(envVar => {
  if (envExample.includes(envVar)) {
    console.log(`  ✅ ${envVar}`)
  } else {
    console.log(`  ❌ ${envVar} - 未在.env.example中定义`)
    hasErrors = true
  }
})

console.log('\n🤖 检查AI配置（可选）...')
optionalEnvVars.forEach(envVar => {
  if (envExample.includes(envVar)) {
    console.log(`  ✅ ${envVar}`)
  } else {
    console.log(`  ⚠️  ${envVar} - 未在.env.example中定义`)
  }
})

// 检查.env.local
if (fs.existsSync('.env.local')) {
  console.log('\n  ✅ .env.local 文件存在')
  const envLocal = fs.readFileSync('.env.local', 'utf8')
  
  console.log('\n  必需配置:')
  requiredEnvVars.forEach(envVar => {
    if (envLocal.includes(envVar) && !envLocal.includes(`${envVar}=your_`)) {
      console.log(`    ✅ ${envVar} 已配置`)
    } else {
      console.log(`    ⚠️  ${envVar} 未配置或使用默认值`)
    }
  })
  
  console.log('\n  AI配置（至少配置一个）:')
  let hasAI = false
  optionalEnvVars.forEach(envVar => {
    if (envLocal.includes(envVar) && !envLocal.includes(`${envVar}=your_`)) {
      console.log(`    ✅ ${envVar} 已配置`)
      hasAI = true
    } else {
      console.log(`    ⚠️  ${envVar} 未配置`)
    }
  })
  
  if (!hasAI) {
    console.log('\n    ⚠️  警告: 未配置任何AI服务，部分功能将不可用')
  }
} else {
  console.log('\n  ⚠️  .env.local 文件不存在')
  console.log('     请复制 .env.example 到 .env.local 并填入实际值')
}

// 检查node_modules
console.log('\n📦 检查依赖...')
if (fs.existsSync('node_modules')) {
  console.log('  ✅ node_modules 存在')
  
  // 检查关键依赖
  const keyDeps = ['next', 'react', '@supabase/supabase-js', 'tailwindcss']
  keyDeps.forEach(dep => {
    if (fs.existsSync(`node_modules/${dep}`)) {
      console.log(`    ✅ ${dep}`)
    } else {
      console.log(`    ❌ ${dep} - 未安装`)
      hasErrors = true
    }
  })
} else {
  console.log('  ❌ node_modules 不存在')
  console.log('     请运行: npm install')
  hasErrors = true
}

// 检查TypeScript配置
console.log('\n⚙️  检查TypeScript配置...')
try {
  const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'))
  if (tsconfig.compilerOptions && tsconfig.compilerOptions.strict) {
    console.log('  ✅ TypeScript strict mode 已启用')
  }
  if (tsconfig.compilerOptions && tsconfig.compilerOptions.paths) {
    console.log('  ✅ 路径别名已配置')
  }
} catch (error) {
  console.log('  ❌ tsconfig.json 解析失败')
  hasErrors = true
}

// 总结
console.log('\n' + '='.repeat(50))
if (hasErrors) {
  console.log('❌ 发现配置问题，请修复后再继续')
  process.exit(1)
} else {
  console.log('✅ 所有检查通过！')
  console.log('\n下一步:')
  console.log('  1. 确保 .env.local 已正确配置')
  console.log('  2. 启动Supabase: supabase start')
  console.log('  3. 运行迁移: supabase db reset')
  console.log('  4. 启动开发服务器: npm run dev')
  console.log('  5. 访问 http://localhost:3000')
}
