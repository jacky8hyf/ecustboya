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

var handlePost = function(activity, body) {
  return activity.allowStudentIdJoin(body.sid)
    .then(function(count){return count}, function(args) {
      if((!(args instanceof Error)) && args.template === "_activityDuplicatedJoin") {
        args.view = "joined_activity";
        args.status = 400;
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
        return Promise.reject({template: "_activityJoined", view: "joined_activity", status: 200, formatArgs:[
          participant.name(), 
          dateformat(participant.createdAt, constants.DATE_FORMAT), 
          activity.name()
        ]});
      }, function(error) {
        return Promise.reject({template: "_serverError", status: 500});
      })
    }).then(function(result){throw new Error('Should not reach here!')}, function(args) {
      if(args instanceof Error) return Promise.reject(args);
      return Template.findByKeyword(args.template).then(function(template) {
        return Promise.resolve([args.view || "activity", template.content(args.formatArgs), args.status || 401]);
      });
    })
}


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
  next();
})
.get(function(req, res, next) {
  res.render('activity', { activityName:req.activity.name() });
})
.post(function(req, res, next) {
  var viewArgs ={ activityName:req.activity.name(), nameValue: req.body.name, classValue: req.body.cls, studentIdValue: req.body.sid, phoneValue: req.body.phone }
  handlePost(req.activity, req.body).then(function(results) {
    viewArgs.message = results[1];
    if(results[2]) res.status(results[2]);
    res.render(results[0], viewArgs);
  }, function(error) {
    next(error);
  });
})

module.exports = router;
