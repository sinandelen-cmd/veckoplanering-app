import {build} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
await build({configFile:false,root:path.resolve('tests/qa'),base:'/qa/',plugins:[react()],build:{outDir:path.resolve('dist/qa'),emptyOutDir:true}})
