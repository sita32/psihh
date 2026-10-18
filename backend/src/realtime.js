// Шина событий реального времени. Сервисы сообщают сюда, что произошло
// (новое сообщение, прочитано), и не знают про Socket.IO; слой сокетов (socket/)
// подписан на эти события и рассылает их нужным пользователям.
const { EventEmitter } = require('node:events');

const realtime = new EventEmitter();

// realtime.emit('notify', { userIds: [..], event: 'message:new', payload: {...} })
module.exports = realtime;
