"use strict";

module.exports = function(imports) {

    let express = imports.modules.express;
    let ObjectId = imports.modules.mongoose.Types.ObjectId;
    let Promise = imports.modules.Promise;
    let util = imports.util;

    let handler = util.handler;
    let requireLogin = util.requireLogin;
    let requireAdmin = util.requireAdmin;
    let audienceQuery = util.hiddenGroups.audienceQuery;

    let Chat = imports.models.Chat;
    let User = imports.models.User;
    let Group = imports.models.Group;

    let router = express.Router();

    // TODO: separate this into separate requests for group and private chats
    router.post("/chats", requireLogin, handler(function*(req, res) {

        if (req.body.type == "private") {
            // private chat

            let otherUser = yield User.findOne({
                _id: req.body.otherUser,
            });
            if (!otherUser) {
                return res.status(400).end("That user does not exist");
            }

            let users = [
                req.user._id,
                otherUser._id,
            ];

            // check to see if already exists
            if ((yield Chat.count({
                    isTwoPeople: true,
                    "audience.users": users,
                })) > 0) {
                return res.status(400).end("This chat already exists");
            }


            let chat = yield Chat.create({
                audience: {
                    groups: [],
                    users: users,
                },
                isTwoPeople: true
            });

            // TODO: rename this stuff for the new client
            res.json({
                _id: otherUser._id,
                fn: otherUser.firstname,
                ln: otherUser.lastname,
                profpicpath: otherUser.profpicpath,
                chat_id: chat._id,
            });

        } else {
            // group chat

            if (req.body.name.length >= 20) { // name character limit
                return res.status(400).end("The chat name has to be 19 characters or fewer");
                // TODO: get rid of this...
            }

            let chat = yield Chat.create({
                name: util.normalizeDisplayedText(req.body.name),
                audience: req.body.audience,
                isTwoPeople: false,
            });

            res.json(chat);
        }

    }));

    router.get("/chats", requireLogin, handler(function*(req, res) {

        // find a chat that has said user as a member
        let chats = yield Chat.find(audienceQuery(req.user), {
                _id: 1,
                name: 1,
                audience: 1,
                updated_at: 1
            })
            .slice("messages", [0, 1])
            .sort("-updated_at")
            .exec();
        // ^ the code above gets the latest message from the chat (for previews in iOS and Android) and orders the list by most recent.

        res.json(chats);

    }));

    router.get("/chats/id/:chatId/messages", requireLogin, handler(function*(req, res) {
        // TODO: maybe in the future combine this with getUsersInChat to improve performance

        let skip = parseInt(req.query.skip);

        // loads 20 messages after skip many messages. example: if skip is 0, it loads messages 0-19, if it"s 20, loads 20-39, etc.
        let chat = yield Chat.findOne({
                _id: req.params.chatId
            })
            .slice("messages", [skip, 20])
            .populate("messages.author")
            .exec();

        res.json(chat.messages);

    }));

    router.get("/chats/id/:chatId/users", requireLogin, handler(function*(req, res) {
        // user members only, not groups

        let chat = yield Chat.findOne({
            _id: req.params.chatId
        });

        let users = yield User.find({
            _id: {
                $in: chat.audience.members
            }
        });

        res.json(users);

    }));

    router.get("/chats/id/:chatId/allMembers", requireLogin, handler(function*(req, res) {

        let chat = yield Chat.findOne({
            _id: req.params.chatId
        });

        let userMembers = yield User.find({
            _id: {
                $in: chat.audience.users
            }
        });

        let groups = yield Group.find({
            _id: {
                $in: chat.audience.groups
            }
        })

        // TODO: the purpose of this currently is to show users and subdivisions
        // try clicking on the gear for a chat in morteam
        // should populate the individual users and groups of a chat
        // this will all be figured out once information is necessary on the frontend

        res.json({
            members: {
                userMembers: userMembers,
                groups: groups
            },
            isTwoPeople: chat.isTwoPeople
        });

    }));

    router.put("/chats/group/id/:chatId/name", requireLogin, handler(function*(req, res) {

        if (req.body.newName.length >= 20) {
            return res.status(400).end("Chat name has to be 19 characters or fewer");
        }

        // TODO: check if the user is a member of the chat

        yield Chat.update({
            _id: req.params.chatId,
        }, {
            name: util.normalizeDisplayedText(req.body.newName)
        });

        res.end();

    }));

    router.delete("/chats/id/:chatId", requireAdmin, handler(function*(req, res) {

        // TODO: check if the user has permissions to delete the chat
        // should they have to be a member of it?

        yield Chat.findOneAndRemove({
            _id: req.params.chatId,
        });

        res.end();

    }));

    router.post("/chats/id/:chatId/messages", requireLogin, handler(function*(req, res) {

        // TODO: check if user is a member of the chat...

        yield Chat.update({
            _id: req.params.chatId,
        }, {
            $push: {
                messages: {
                    $each: [{
                        author: req.user._id,
                        content: util.normalizeDisplayedText(req.body.content),
                        timestamp: new Date()
                    }],
                    $position: 0
                }
            },
            updated_at: new Date()
        });

        res.end();

    }));

    return router;

};
