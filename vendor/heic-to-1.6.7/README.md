# heic-to 1.6.7

来源：https://github.com/hoppergee/heic-to/tree/v1.6.7
分发包：https://registry.npmjs.org/heic-to/-/heic-to-1.6.7.tgz
原始构建：dist/iife/heic-to.js，未修改。LGPL-3.0，许可证见 LICENSE。包含 libheif 1.23.7 / libde265 组件及原构建中的版权声明。

仅在浏览器无法原生解码 HEIC/HEIF 时按需加载，使用内置 Worker 在本机转换 JPEG；不调用第三方网络服务。生产需要随 dist/vendor 整体发布，不能只覆盖 HTML。包内源码/构建方法可从上述源地址获得。
