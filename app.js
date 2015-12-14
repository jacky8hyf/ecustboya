'use strict';
var domain = require('domain');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var xmlparser = require('express-xml-bodyparser');
var wechatapi = require('./routes/wechatapi');
var activity_route = require('./routes/activity');
var cloud = require('./cloud');

var app = express();

var errorXmlBuilder = new (require('xml2js').Builder)({
  rootName: 'error'
});

// 设置 view 引擎
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// 加载云代码方法
app.use(cloud);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(xmlparser({
  normalizeTags:false,
  normalize:false,
  trim:true,
  explicitArray:false,
}));
app.use(cookieParser());

// 访问记录
app.use(function(req, res, next) {
  console.log('%s %s', req.method, req.originalUrl);
  next();
});

// 未处理异常捕获 middleware
app.use(function(req, res, next) {
  var d = null;
  if (process.domain) {
    d = process.domain;
  } else {
    d = domain.create();
  }
  d.add(req);
  d.add(res);
  d.on('error', function(err) {
    console.error('uncaughtException url=%s, msg=%s', req.url, err.stack || err.message || err);
    if(!res.finished) {
      res.statusCode = 500;
      res.end('uncaughtException');
    }
  });
  d.run(next);
});

// 可以将一类的路由单独保存在一个文件中

app.use('/activity', activity_route);
app.use('/wechat-api', wechatapi);

// 如果任何路由都没匹配到，则认为 404
// 生成一个异常让后面的 err handler 捕获
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// 如果是开发环境，则将异常堆栈输出到页面，方便开发调试
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) { // jshint ignore:line
    var statusCode = err.status || 500;
    if(statusCode === 500) {
      console.error(err.stack || err);
    }
    res.status(statusCode);
    res.type('xml').send(errorXmlBuilder.buildObject({
      message: err.message || err,
      error: (err.toJSON ? err.toJSON() : err)
    }));
  });
}

// 如果是非开发环境，则页面只输出简单的错误信息
app.use(function(err, req, res, next) { // jshint ignore:line
  res.status(err.status || 500);
  res.json({
    message: err.message || err,
  });
});

module.exports = app;
