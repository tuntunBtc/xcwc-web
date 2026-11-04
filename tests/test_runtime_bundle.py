"""Regression boundaries for extracting executable resources from HTML."""
from pathlib import Path
import importlib.util
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('runtime_bundle',Path(__file__).resolve().parents[1]/'scripts/runtime_bundle.py')
bundle=importlib.util.module_from_spec(spec);spec.loader.exec_module(bundle)

class RuntimeBundleTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);(self.root/'src').mkdir();(self.root/'vendor').mkdir()
        (self.root/'src/route-loader.js').write_text('// loader\n',encoding='utf-8')
        for name in ['core','dom']:(self.root/'vendor'/f'floating-ui.{name}.js').write_text('// library\n',encoding='utf-8')
        self.builder=bundle.RuntimeBundle(self.root,type('Media',(),{'rewrite':lambda _,text:text})())
        self.builder.icons=lambda:''

    def test_state_json_and_mutable_theme_styles_stay_in_the_document(self):
        routes=''.join('/*XCWC_ROUTE_'+name+'_BEGIN*/\n/*XCWC_ROUTE_'+name+'_END*/' for name in ['NEST','CITY','ADOPT','SHOP','PHOTO','ACCOUNT'])
        frame='<html><head><script type="application/json" id="codex-visualization-widget-state">__CODEX_VISUALIZATION_WIDGET_STATE__</script><style id="codex-visualization-host-theme">:root{}</style><style>body{color:red}</style></head><body><script>\n(()=>{\n'+routes+'\nfunction mountIsolated(){return "<style>"+css+"</style>"+template}\nfunction render(){legacy()}\nrender();\nif(globalThis.Tweak){}\n})();</script></body></html>'
        result=self.builder.split_frame(frame)
        self.assertIn('type="application/json"',result)
        self.assertIn('__CODEX_VISUALIZATION_WIDGET_STATE__',result)
        self.assertIn('<style id="codex-visualization-host-theme">:root{}</style>',result)
        executable='\n'.join(p.read_text(encoding='utf-8') for p in (self.root/'dist/runtime').glob('*.js'))
        self.assertNotIn('__CODEX_VISUALIZATION_WIDGET_STATE__',executable)
        self.assertNotIn('/*XCWC_ROUTE_',executable)
        self.assertIn('return "<style>"+css+"</style>"+template',executable)

    def test_host_preserves_origin_replacement_but_chunks_use_trusted_bootstrap(self):
        host="frame.srcdoc=frameHtml.replaceAll('__XCWC_ASSET_ORIGIN__',location.origin)"
        url=self.builder.emit('host',host)
        self.assertEqual((self.root/'dist'/url.split('__XCWC_ASSET_ORIGIN__/')[1]).read_text(encoding='utf-8'),host)
        url=self.builder.emit('page',"const base='__XCWC_ASSET_ORIGIN__';const art='__XCWC_ASSET_ORIGIN__/assets/a.webp';")
        result=(self.root/'dist'/url.split('__XCWC_ASSET_ORIGIN__/')[1]).read_text(encoding='utf-8')
        self.assertIn('base=globalThis.xcwcAssetOrigin',result)
        self.assertIn("art='/assets/a.webp'",result)

    def test_changed_bytes_produce_a_new_url(self):
        self.assertNotEqual(self.builder.emit('page','one'),self.builder.emit('page','two'))

    def test_missing_route_boundary_fails_build(self):
        with self.assertRaisesRegex(ValueError,'Missing route boundary'):
            self.builder.split_frame('<html></html>')

if __name__=='__main__':unittest.main()
