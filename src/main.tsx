import { render } from 'preact';
import { App } from './app';
import { initHistory } from './ui';
import './styles.css';

// 首次启动时申请持久化存储，防止浏览器清理导入的文件
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((ok) => { if (!ok) void navigator.storage.persist(); }).catch(() => {});
}

initHistory();
render(<App />, document.getElementById('app')!);
