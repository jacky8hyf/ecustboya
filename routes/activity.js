var router = require('express').Router();
var AV = require('leanengine');
var sprintfjs = require("sprintf-js");
var sprintf = sprintfjs.sprintf,
    vsprintf = sprintfjs.vsprintf;
var utils = require('../lib/utils');
var models = require('../models');
var constants = require('../lib/constants');
var dateformat = require('dateformat');
var Activity = models.Activity,
    Participant = models.Participant,
    Template = models.Template;

// 路由

router.param('activityId', function (req, res, next, activityId) {
  AV.queryObject(Activity, activityId).toPromise().then(function(activity) {
    req.activity = activity;
    next();
  }, function(error) {
    error.status=404;
    next(error);
  });
})

router.route('/:activityId')
.all(function(req, res, next) {
  req.viewArgs = { activityName:req.activity.name(), nameValue: req.body.name, classValue: req.body.cls, studentIdValue: req.body.sid, phoneValue: req.body.phone }
  next();
})
.get(function(req, res, next) {
  req.activity.allowJoin().then(function(count) {
    res.render('activity', { activityName:req.activity.name() });
  }, function(args) {
    if(args instanceof Error) return Promise.reject(args);
    return Template.findByKeyword(args.template).then(function(template) {
      req.viewArgs.message = template.content(args.formatArgs);
      req.viewArgs.isErrorMsg = true;
      res.status(400).render('msg_view', req.viewArgs);
    });
  })
  
})
.post(function(req, res, next) {
  var activity = req.activity;
  var body = req.body;
  var rejectToTemplatePromise =
    Promise.resolve().then(function() {
      var template = (function() {
        if(!utils.isString(body.name) || !body.name)
          return "_nameError";
        if(!utils.isString(body.cls) || !body.cls)
          return "_classError";
        if(!utils.isString(body.phone) || !body.phone.match(/^((\+86|)\d{11})$/))
          return "_phoneFormatError";
        if(!utils.isString(body.sid) || !body.sid.match(/^\d+$/))
          return "_sidFormatError";
      })();
      if (template) return Promise.reject({template: template})
      return activity.allowStudentIdJoin(body.sid)
    }).then(function(count){return count}, function(args) {
      if(args instanceof Error)
        return Promise.reject(args);
      args.view = "msg_view";
      args.status = 400;
      if(args.template !== "_activityDuplicatedJoin") {
        args.isErrorMsg = true;
      }
      return Promise.reject(args)
    }).then(function(count) {
      if(count >= activity.capacity)
        return Promise.reject({template: "_activityFull"});
      return Participant.new({
          activity: activity,
          name: body.name,
          cls: body.cls,
          studentId: body.sid,
          rank: count + 1,
          phoneNumber: body.phone,
      }).save().toPromise().then(function(participant) {
        return Promise.reject({template: "_activityJoined", view: "msg_view", status: 200, formatArgs:[
          participant.name(), 
          dateformat(participant.createdAt, constants.DATE_FORMAT), 
          activity.name(),
          participant.rank(),
        ]});
      }, function(error) {
        return Promise.reject({template: "_serverError", status: 500});
      })
    });

  rejectToTemplatePromise.then(function(result){throw new Error('Should not reach here!')}, function(args) {
    console.log(args);
    if(args instanceof Error) {
      next(args);
      return;
    }
    return Template.findByKeyword(args.template).then(function(template) {
      return template ? template.content(args.formatArgs) : args.template;
    }).then(function(msg) {
      req.viewArgs.message = msg;
      req.viewArgs.isErrorMsg = args.isErrorMsg;
      res.status(args.status || 400).render(args.view || "activity", req.viewArgs);
    })
  });
})

module.exports = router;
