import React from 'react';
import {renderToString} from 'react-dom/server';
import createHistory from 'history/createMemoryHistory'
import { getBundles } from 'react-loadable/webpack';
import stats from '../dist/server/react-loadable.json';
import Helmet from 'react-helmet';
import {matchPath} from 'react-router-dom';
import Loadable from 'react-loadable';
import getClient from './getClient';
import { matchRoutes } from 'react-router-config';

const createStore=(configureStore)=>{
  let store=configureStore()
  return store;
}

const createTags=(modules)=>{
  let bundles = getBundles(stats, modules);
  let scriptfiles = bundles.filter(bundle => bundle.file.endsWith('.js'));
  let stylefiles = bundles.filter(bundle => bundle.file.endsWith('.css'));
  let scripts=scriptfiles.map(script=>`<script src="/${script.file}"></script>`).join('\n');
  let styles=stylefiles.map(style=>`<link href="/${style.file}" rel="stylesheet"/>`).join('\n');
  return {scripts,styles}
}

const prepHTML=(data,{html,head,rootString,scripts,styles,initState})=>{
  data=data.replace('<html',`<html ${html}`);
  data=data.replace('</head>',`${head} \n ${styles}</head>`);
  data=data.replace('<div id="root"></div>',`<div id="root">${rootString}</div>`);
  data=data.replace('<body>',`<body> \n <script>window.__INITIAL_STATE__ =${JSON.stringify(initState)}</script>`);
  data=data.replace('</body>',`${scripts}</body>`);
  return data;
}

const getMatch=(routesArray, url)=>{
  return routesArray.some(router=>matchPath(url,{
    path: router.path,
    exact: router.exact,
  }))
}

const makeup=(ctx,store,createApp,html)=>{
  let initState=store.getState();
  let history=createHistory({initialEntries:[ctx.req.url]});

  let modules=[];

  let rootString= renderToString(
    <Loadable.Capture report={moduleName => modules.push(moduleName)}>
      {createApp({store,history})}
    </Loadable.Capture>
  );
  let {scripts,styles}=createTags(modules)

  const helmet=Helmet.renderStatic();
  let renderedHtml=prepHTML(html,{
    html:helmet.htmlAttributes.toString(),
    head:helmet.title.toString()+helmet.meta.toString()+helmet.link.toString(),
    rootString,
    scripts,
    styles,
    initState
  })
  return renderedHtml;
}

let {configureStore,createApp,html,routesConfig}=getClient();

const clientRouter=async(ctx,next)=>{
  let store=createStore(configureStore);

  let branch=matchRoutes(routesConfig,ctx.req.url)
  let promises = branch.map(({route,match})=>{
    return route.thunk?(route.thunk(store)):Promise.resolve(null)
  });
  await Promise.all(promises)
    .then(()=>console.log('000000',store.getState()))
    .catch(err=>console.log('err:---',err))

  let isMatch=getMatch(routesConfig,ctx.req.url);
  if(isMatch){
    let renderedHtml=await makeup(ctx,store,createApp,html);
    ctx.body=renderedHtml
  }
  await next()
}

export default clientRouter;

