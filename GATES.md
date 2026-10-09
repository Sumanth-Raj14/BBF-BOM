# Gates: complete the outstanding work

OWNS: frontend/**, backend/**, GATES.md

Scope: close the four remaining items I can finish without you — the npm high
advisories, the work-order shop-floor UI, the process-plans UI, and getting it
all merged to master through a green PR.

NOT IN SCOPE, because they are not mine to do (surfaced as handoffs, not
silently dropped):
  * the GitHub contributor sidebar — needs GitHub Support to purge refs/pull/*,
    or a fresh repo. Every surface I can reach reports one contributor.
  * activating the Claude Code PreToolUse hook — needs /hooks or a restart.

- [ ] G1: no high or critical npm advisories remain in frontend
  CHECK: node -e "const{spawnSync}=require('child_process');const r=spawnSync('npm',['audit','--json'],{cwd:'frontend',encoding:'utf8',maxBuffer:1e9,shell:true});const v=JSON.parse(r.stdout).metadata.vulnerabilities;if(v.high||v.critical){console.error('remaining: '+JSON.stringify(v));process.exit(1)}console.log('NPM_AUDIT_CLEAN '+JSON.stringify(v))"
  EXPECT: NPM_AUDIT_CLEAN
  EVIDENCE: pending

- [ ] G2: work-order shop-floor routes have a UI caller
  CHECK: node -e "const fs=require('fs');const api=fs.readFileSync('frontend/api.js','utf8');const need=['/action','/materials/','/operations/'];const miss=need.filter(n=>!api.includes('work-orders')||!api.includes(n));if(miss.length){console.error('api.js missing: '+miss);process.exit(1)}const g=require('child_process').spawnSync('node',['-e','const fs=require(\"fs\");const p=require(\"path\");let hit=0;(function w(d){for(const f of fs.readdirSync(d)){const fp=p.join(d,f);const s=fs.statSync(fp);if(s.isDirectory()){if(!/node_modules|__tests__/.test(fp))w(fp)}else if(/\\\\.jsx?$/.test(f)&&fs.readFileSync(fp,\"utf8\").includes(\"workOrderOps\"))hit++}})(\"frontend/src\");if(!hit){console.error(\"no UI file calls workOrderOps\");process.exit(1)}console.log(\"ok\")'],{encoding:'utf8'});if(g.status!==0){console.error(g.stderr||g.stdout);process.exit(1)}console.log('WORKORDER_UI_WIRED')"
  EXPECT: WORKORDER_UI_WIRED
  EVIDENCE: pending

- [ ] G3: frontend tests pass and the production build succeeds
  CHECK: node -e "const{spawnSync}=require('child_process');for(const a of [['npx',['vitest','run']],['npm',['run','build']]]){const r=spawnSync(a[0],a[1],{cwd:'frontend',encoding:'utf8',maxBuffer:1e9,shell:true});if(r.status!==0){console.error((r.stdout||'').slice(-3000));process.exit(1)}}console.log('FRONTEND_OK')"
  EXPECT: FRONTEND_OK
  EVIDENCE: pending

- [ ] G4: every api.js path still resolves against the committed openapi spec
  CHECK: node -e "const{spawnSync}=require('child_process');const r=spawnSync('npx',['vitest','run','src/__tests__/api-contract.test.js'],{cwd:'frontend',encoding:'utf8',maxBuffer:1e9,shell:true});if(r.status!==0){console.error((r.stdout||'').slice(-2500));process.exit(1)}console.log('CONTRACT_OK')"
  EXPECT: CONTRACT_OK
  EVIDENCE: pending

- [ ] G5: backend suite still passes (only the 2 SQLite-only search tests may fail)
  CHECK: node -e "const{spawnSync}=require('child_process');const r=spawnSync('python',['-m','pytest','app/tests','-q','--no-header','-p','no:cacheprovider'],{cwd:'backend',encoding:'utf8',maxBuffer:1e9});const o=(r.stdout||'')+(r.stderr||'');const m=o.match(/(\\d+) failed/);const f=m?+m[1]:0;const p=(o.match(/(\\d+) passed/)||[])[1];if(!p){console.error('no pytest summary\\n'+o.slice(-2000));process.exit(1)}if(f>2){console.error('regression: '+f+' failures\\n'+o.slice(-3000));process.exit(1)}console.log('BACKEND_OK passed='+p+' failed='+f)"
  EXPECT: BACKEND_OK
  EVIDENCE: pending

- [ ] G6: commit attribution stays clean on the branch
  CHECK: node .unlazy-checks.mjs no-trailers local
  EXPECT: ATTRIBUTION_CLEAN
  EVIDENCE: pending

- [ ] G7: merged to master through a PR with all 9 required checks green
  EVIDENCE: pending

<!--
G7 is manual: merging needs CI to run on GitHub's side and a merge decision,
neither of which a local command decides. Evidence is the merge commit sha
plus the live 9/9 required-check read-back.

G5 tolerates 2 failures because test_search.py's full-text tests use ILIKE and
tsvector, which SQLite does not implement. It fails on 3+, so a real
regression still trips it.
-->
