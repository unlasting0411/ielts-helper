/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 相对路径：部署到 GitHub Pages 子目录也能用
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: '雅思学习助手',
        short_name: '雅思助手',
        description: '雅思一个月备考：每日计划、本地资料、计时、分数和笔记',
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f7f9',
        theme_color: '#2457c5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 运行时零网络请求：所有静态资源（含 pdf.js worker、字体映射）都预缓存
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,json,bcmap,pfb,ttf,wasm,icc}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
