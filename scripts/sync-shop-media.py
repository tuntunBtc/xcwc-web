"""Explicitly sync public catalogue URLs to the frontend's byte-derived aliases."""
from pathlib import Path
from media_pipeline import MediaPlan

root=Path(__file__).resolve().parents[1]
catalogue=root.parent/'xcwc-api/src/main/resources/shop/catalog.json'
plan=MediaPlan(root)
old=catalogue.read_text(encoding='utf-8')
new=plan.rewrite(old)
if old!=new:
    catalogue.write_text(new,encoding='utf-8')
    print('Updated catalogue media URLs; deploy this backend together with the frontend.')
else:
    print('Catalogue media URLs already current.')
