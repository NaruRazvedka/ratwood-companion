/* SPDX-License-Identifier: AGPL-3.0-or-later */
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const branch='codex/ratwood-source-update';
function report(manifest){
  const changes=manifest.changes||{};
  const list=(label,items)=>`${label}: ${(items||[]).length}\n${(items||[]).slice(0,35).map(p=>'- '+p).join('\n')}${items?.length>35?'\n- See the source manifest for the remaining paths.':''}`;
  return `Refresh the Ratwood reference to \`${manifest.revision}\`.\n\n${list('Added source files',changes.added)}\n\n${list('Changed source files',changes.changed)}\n\n${list('Removed source files',changes.removed)}\n\nReview the generated coverage report for affected topics and unresolved mechanics. Changelog files are included in the source comparison; code changes are reviewed even when no changelog mentions them.\n\nThis proposal does not verify the version deployed on the live game server. Merge only after reviewing recipe changes, source gaps, and attribution.\n`;
}
async function propose(){
  if(process.env.GITHUB_ACTIONS!=='true')throw Error('This publishing helper runs only inside GitHub Actions. Use the refresh command locally to inspect changes.');
  const repository=process.env.GITHUB_REPOSITORY;
  if(!/^[\w.-]+\/[\w.-]+$/.test(repository||''))throw Error('Invalid repository.');
  const manifest=JSON.parse(fs.readFileSync('guide/sources/ratwood-current/manifest.json','utf8'));
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
  if(!git('status','--porcelain','--','guide')){console.log('No source or content changes.');return;}
  const token=process.env.GH_TOKEN;if(!token)throw Error('GitHub Actions token unavailable.');
  async function api(endpoint,method='GET',body){
    const response=await fetch('https://api.github.com/repos/'+repository+endpoint,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined});
    const value=await response.json();if(!response.ok){const error=Error(`GitHub ${response.status}: ${value.message||'Request failed'}`);error.status=response.status;throw error;}return value;
  }
  const previous=await api('/git/matching-refs/heads/'+branch);
  const lease=previous.find(ref=>ref.ref==='refs/heads/'+branch)?.object.sha;
  git('switch','-c',branch);
  git('config','user.name','github-actions[bot]');
  git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
  git('add','--','guide');
  git('commit','-m','Refresh Ratwood source '+manifest.revision.slice(0,10));
  git('push',lease?'--force-with-lease=refs/heads/'+branch+':'+lease:'--force-with-lease=refs/heads/'+branch+':','origin','HEAD:refs/heads/'+branch);
  const owner=repository.split('/')[0];
  const pending=await api('/pulls?state=open&head='+encodeURIComponent(owner+':'+branch));
  const diffPath='guide/sources/public-change-report.json';
  const topicChanges=fs.existsSync(diffPath)?JSON.parse(fs.readFileSync(diffPath,'utf8')):{};
  const summary=Object.entries(topicChanges).map(([kind,rows])=>`${kind}: ${rows.length}`).join(' · ');
  const upstreamPath='guide/sources/public-upstream-changes.json';
  const outside=fs.existsSync(upstreamPath)?JSON.parse(fs.readFileSync(upstreamPath,'utf8')).outsideSnapshot.length:0;
  const body=report(manifest)+'\nTopic changes: '+summary+'\n\nSee `guide/sources/public-change-report.json` for affected topic IDs and names.\n\nUpstream paths outside the supported snapshot: '+outside+'. Review `guide/sources/public-upstream-changes.json` before merging.\n',title='Review Ratwood update '+manifest.revision.slice(0,10);
  let pr;
  try{pr=pending.length?await api('/pulls/'+pending[0].number,'PATCH',{title,body}):await api('/pulls','POST',{title,body,head:branch,base:'main'});}
  catch(error){
    if(error.status!==403)throw error;
    const compare=`https://github.com/${repository}/compare/main...${branch}?expand=1`;
    const message=`GitHub blocked automatic pull-request creation. The tested update remains on \`${branch}\`; [open its review](${compare}) manually. Repository review permissions were not changed.\n`;
    if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,message);
    console.log(message);return;
  }
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`[Review the content update](${pr.html_url})\n`);
  console.log(pr.html_url);
}
if(require.main===module)propose().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={report,propose};
