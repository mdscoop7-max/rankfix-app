"""Read-only local QA catalog runner; original responses + checksums, no verdict inflation.
Run from repository root after starting its secured local QA development server:
python3 docs/qa/master-20261104/run-catalog.py --catalog mkb48 --token-file /tmp/session --output /tmp/qa-run
Only same-commit/same-catalog runs can be resumed. Stops on RankFix infrastructure/auth/quota.
"""
import argparse, datetime, gzip, hashlib, json, pathlib, subprocess, time, urllib.error, urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--catalog', choices=['mkb48', 'fresh144'], required=True)
parser.add_argument('--token-file', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--hosts', help='Optional comma-separated subset; remaining catalog sites stay notStarted')
args = parser.parse_args()
base = 'http://127.0.0.1:3002'
token = pathlib.Path(args.token_file).read_text().strip()
if len(token) != 64 or any(c not in '0123456789abcdef' for c in token.lower()):
    raise SystemExit('Invalid local QA session file')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
subprocess.run(['git', 'diff', '--exit-code', 'HEAD', '--', 'app', 'lib', 'components', 'scripts', 'tests', '.github'], check=True, stdout=subprocess.DEVNULL)
out = pathlib.Path(args.output)
out.mkdir(parents=True, exist_ok=True)
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
def request(path, data=None, timeout=20):
    req = urllib.request.Request(base + path, headers={'Content-Type': 'application/json', 'Cookie': 'rankfix_local_qa=' + token}, data=None if data is None else json.dumps(data).encode())
    try:
        response = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read(8_000_001)
    if len(raw) > 8_000_000:
        raise RuntimeError('Response exceeds evidence limit')
    if token.encode() in raw:
        raise RuntimeError('Refusing evidence containing local session credential')
    return response.status, json.loads(raw), raw

def check_version():
    status, version, _ = request('/api/scan/version')
    if status != 200 or version.get('environment') != 'local' or version.get('commitSha') != commit:
        raise RuntimeError('QA runtime does not match clean local source commit')
check_version()
status, catalog, raw_catalog = request('/api/testlab/catalog?catalog=' + args.catalog)
if status != 200 or catalog.get('catalogId') != args.catalog or len(catalog.get('sites', [])) != (48 if args.catalog == 'mkb48' else 144):
    raise SystemExit('Authorized catalog/count not confirmed')
if len({s['host'] for s in catalog['sites']}) != len(catalog['sites']):
    raise SystemExit('Duplicate catalog hosts')
catalog_sha = hashlib.sha256(raw_catalog).hexdigest()
report_file = out / 'run.json'
report = json.loads(report_file.read_text()) if report_file.exists() else {'commit': commit, 'catalogId': args.catalog, 'catalogSha256': catalog_sha, 'startedUtc': now(), 'results': []}
if (report['commit'], report['catalogId'], report['catalogSha256']) != (commit, args.catalog, catalog_sha):
    raise SystemExit('Cannot combine different commits or catalogs')
(out / 'catalog.json').write_bytes(raw_catalog)
selected = set(args.hosts.split(',')) if args.hosts else {s['host'] for s in catalog['sites']}
if not selected.issubset({s['host'] for s in catalog['sites']}):
    raise SystemExit('Selected host is not in this catalog')
report.setdefault('rounds', []).append({'startedUtc': now(), 'requestedHosts': sorted(selected)})
rankfix_attributions = ['rankfix_session', 'rankfix_quota', 'rankfix_infrastructure']
def retryable(row):
    return bool(row.get('runnerError')) or (row.get('incident') or {}).get('attribution') in rankfix_attributions

def save():
    report['updatedUtc'] = now()
    report['planned'] = len(catalog['sites'])
    report['attempts'] = len(report['results'])
    report['attempted'] = len({r['host'] for r in report['results']})
    report['notStarted'] = report['planned'] - report['attempted']
    latest = {r['host']: r for r in report['results']}
    report['successfulReports'] = sum(r.get('success') is True for r in latest.values())
    report['pending'] = sum(retryable(r) for r in latest.values())
    report['certified'] = False
    report['groundTruth'] = 'proposed_not_independently_verified'
    temp = report_file.with_suffix('.tmp')
    temp.write_text(json.dumps(report, indent=2) + '\n')
    temp.replace(report_file)
save()
for site in catalog['sites']:
    if site['host'] not in selected:
        continue
    prior = [r for r in report['results'] if r['host'] == site['host']]
    if prior and not retryable(prior[-1]):
        continue
    check_version()
    started = time.monotonic()
    row = {'host': site['host'], 'expectedProposed': site['expected'], 'startedUtc': now()}
    try:
        status, data, raw = request('/api/scan', {'url': 'https://' + site['host'] + '/', 'mode': 'both', 'dashboard': True, 'language': 'nl'}, timeout=280)
        artifact = site['host'] + '.json.gz'
        (out / artifact).write_bytes(gzip.compress(raw, mtime=0))
        row.update(apiHttpStatus=status, responseSha256=hashlib.sha256(raw).hexdigest(), artifact=artifact, success=data.get('success') is True,
                   sector=data.get('sectorProfile'), websiteType=data.get('websiteProfile', {}).get('websiteType'), scoreModel=data.get('scoreModel'),
                   pageCounts=data.get('multiPage', {}).get('counts'), code=data.get('code'), incident=data.get('incident'))
    except Exception as error:
        row.update(success=False, runnerError=type(error).__name__ + ': ' + str(error))
    row['elapsedSeconds'] = round(time.monotonic() - started, 3)
    report['results'].append(row)
    save()
    print(json.dumps({'host': row['host'], 'http': row.get('apiHttpStatus'), 'sector': (row.get('sector') or {}).get('sector'), 'key': (row.get('sector') or {}).get('key'), 'code': row.get('code'), 'attempted': report['attempted'], 'planned': report['planned']}), flush=True)
    if retryable(row):
        report['stoppedReason'] = row.get('runnerError') or row.get('code') or 'RankFix-side incident'
        save()
        raise SystemExit('Stopped safely; remaining sites were not assessed')
    time.sleep(4)
report['subsetCompletedUtc'] = now()
if report['notStarted'] == 0 and report['pending'] == 0:
    report['completedUtc'] = now()
save()
