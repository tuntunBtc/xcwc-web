#!/usr/bin/env python3
"""Run client modules against the supplied JAR in disposable, loopback-only MySQL.
No production configuration is read. Docker images must already exist locally.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

WEB = Path(__file__).resolve().parents[1]
ROOT = WEB.parent
OUT = ROOT / 'output/miniprogram-cloud-20261111'
JAR = ROOT / 'output/backend-cloud-pet-20261111/xcwc.jar'
EXPECTED_SHA = '174ddcf5cc6b9a53461d7165a81f35b2703788381347dac02f27e93a8d696475'

def call(args, **kwargs):
    return subprocess.run(args, check=True, text=True, encoding='utf-8', capture_output=True, **kwargs).stdout.strip()

def main():
    assert hashlib.sha256(JAR.read_bytes()).hexdigest() == EXPECTED_SHA, 'Backend JAR changed: review its version before running'
    for port in (13387, 18097):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', port))
    for image in ('mysql:8.4', 'maven:3.9-eclipse-temurin-21'):
        call(['docker', 'image', 'inspect', image])
    suffix = secrets.token_hex(5)
    network, database, api = ('xcwc-mpcloud-' + kind + '-' + suffix for kind in ('net', 'db', 'api'))
    created = []
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        call(['docker', 'network', 'create', network])
        with tempfile.TemporaryDirectory(prefix='xcwc-mpcloud-') as temporary:
            password = secrets.token_hex(24)
            db_env = Path(temporary) / 'db.env'
            api_env = Path(temporary) / 'api.env'
            db_env.write_text('MYSQL_ROOT_PASSWORD=' + password + '\nMYSQL_DATABASE=mpcloud_test\n', encoding='utf-8')
            api_env.write_text('\n'.join([
                'DB_URL=jdbc:mysql://' + database + ':3306/mpcloud_test?connectionTimeZone=UTC',
                'DB_USERNAME=root', 'DB_PASSWORD=' + password,
                'SERVER_ADDRESS=0.0.0.0', 'SERVER_PORT=8080', 'WX_APP_ID=wx_mpcloud_isolated',
                'WX_DEBUG_SESSION_KEY=AAAAAAAAAAAAAAAAAAAAAA==', 'CHECKIN_STORAGE_DIR=/tmp/checkins',
            ]) + '\n', encoding='utf-8')
            db_env.chmod(0o600)
            api_env.chmod(0o600)
            call(['docker', 'run', '-d', '--name', database, '--network', network, '-p', '127.0.0.1:13387:3306', '--env-file', str(db_env), 'mysql:8.4'])
            created.append(database)
            sql_command = ['docker', 'exec', '-i', database, 'sh', '-c', 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot mpcloud_test']
            deadline = time.monotonic() + 90
            while True:
                try:
                    call(sql_command, input='SELECT 1;')
                    break
                except subprocess.CalledProcessError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(1)
            call(['docker', 'run', '-d', '--name', api, '--network', network, '-p', '127.0.0.1:18097:8080', '--env-file', str(api_env), '-v', str(JAR) + ':/app/xcwc.jar:ro', 'maven:3.9-eclipse-temurin-21', 'java', '-jar', '/app/xcwc.jar', '--app.wx.debug=true', '--app.wx.debug-code=MP_CLOUD_TEST', '--app.wx.debug-openid=mp_cloud_isolated_test'])
            created.append(api)
            deadline = time.monotonic() + 90
            while True:
                try:
                    with urllib.request.urlopen('http://127.0.0.1:18097/api/me/pets', timeout=2):
                        pass
                except urllib.error.HTTPError as error:
                    if error.code == 401:
                        break
                except (urllib.error.URLError, TimeoutError):
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError('Isolated backend did not start')
                time.sleep(1)
            migration = call(sql_command, input='SELECT version,success FROM flyway_schema_history ORDER BY installed_rank;')
            assert migration.splitlines()[-1] == '12\t1', migration
            (OUT / 'migrations.txt').write_text(migration + '\n', encoding='utf-8')
            rows = []
            for number in (1, 2):
                rows.append("('%s','yanji_blue','Isolated bird %d',REPEAT('0',64),UTC_TIMESTAMP(),'hangzhou','杭州','小黄莺','yanji_blue','黄色','MP-CLOUD-ISOLATED','HZ-HY-900000000000000010%d','HY','HZ',TRUE)" % (str(number) * 32, number, number))
            call(sql_command, input='INSERT INTO bird(id,type_id,name,claim_hash,created_at,city_code,city_name,type_name,skin_id,skin_name,batch_no,bird_code,ip_code,code_city,active) VALUES ' + ','.join(rows) + ';')
            started = time.monotonic()
            for script in ('verify-miniprogram-cloud-http.cjs', 'verify-miniprogram-cloud-events.cjs'):
                if script.endswith('events.cjs'):
                    # Event is server-owned; wait for its real 60-second due time.
                    remaining = 65 - (time.monotonic() - started)
                    if remaining > 0:
                        print('Main flows passed; waiting for real event due time.', flush=True)
                        while remaining > 0:
                            time.sleep(min(1, remaining))
                            remaining = 65 - (time.monotonic() - started)
                result = call(['node', str(WEB / 'scripts' / script)], cwd=WEB)
                (OUT / (script + '.log')).write_text(result + '\n', encoding='utf-8')
                print(result, flush=True)
            (OUT / 'environment.json').write_text(json.dumps({
                'jarSha256': EXPECTED_SHA, 'apiRoot': 'http://127.0.0.1:18097', 'database': 'disposable MySQL 8.4 mpcloud_test',
                'migration': 12, 'wechat': 'synthetic debug exchange', 'phone': 'not tested', 'cleanup': 'owned containers/network removed in finally',
            }, indent=2) + '\n', encoding='utf-8')
    finally:
        if api in created:
            result = subprocess.run(['docker', 'logs', api], capture_output=True, text=True, encoding='utf-8')
            (OUT / 'backend.log').write_text(result.stdout + result.stderr, encoding='utf-8')
        for name in reversed(created):
            subprocess.run(['docker', 'rm', '-f', '-v', name], check=False, capture_output=True)
        subprocess.run(['docker', 'network', 'rm', network], check=False, capture_output=True)

if __name__ == '__main__':
    main()
