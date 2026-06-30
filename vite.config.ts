import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// base 경로는 .env 가 아니라 CI(deploy.yml/ci.yml)의 VITE_BASE_WEB 로 주입한다.
// (시크릿이 아니므로 워크플로 env 로 관리; .env 는 더 이상 커밋하지 않음)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const base = env.VITE_BASE_WEB || '/';
  return {
    base,
    plugins: [react()],
    resolve: {
      alias: { '@': '/src' },
    },
    define: {
      // Cesium 정적 자산은 public/cesium 에서 제공 → base 기준 경로
      CESIUM_BASE_URL: JSON.stringify(`${base}cesium/`),
    },
  };
});
