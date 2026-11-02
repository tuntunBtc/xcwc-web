"""Encode the approved felt reference derivatives; originals remain untouched."""
from pathlib import Path
from PIL import Image
import json
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('/Users/beluga/.codex/generated_images/01a19a2c-5a54-7951-a14e-34ea814ceecb')
JOBS=[('exec-20f4fffb-f4e2-4d58-a975-8b7ce02af79d.png','scene-720.webp',720,78),('exec-70008d87-504a-4822-aa73-a5aca942b443.png','idle-640.webp',640,84),('exec-70008d87-504a-4822-aa73-a5aca942b443.png','avatar-192.webp',192,82),('exec-e2b3bddc-963b-4ad2-bf42-25286a97912b.png','panel-720.webp',720,80),('exec-6156e895-c8de-4254-8550-d6567b80843a.png','cards-1200.webp',1200,82),('exec-261e5a21-abc8-4b7e-bf2c-b5c57077af3f.png','tools-512.webp',512,82)]
OUT=ROOT/'assets/nest/felt';OUT.mkdir(parents=True,exist_ok=True);report=[]
for name,target,width,quality in JOBS:
 with Image.open(SOURCE/name) as im:
  im.load()
  if im.width>width:im=im.resize((width,round(im.height*width/im.width)),Image.Resampling.LANCZOS)
  path=OUT/target;im.save(path,'WEBP',quality=quality,method=6,exact=True)
  report.append({'file':target,'size':im.size,'bytes':path.stat().st_size,'mode':im.mode,'source':name})
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for r in report:print(r['file'],r['size'],r['bytes'])
