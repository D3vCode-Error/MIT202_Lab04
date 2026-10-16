'use strict';

// Exercise 4: all authorization decisions are centralized here.
// membership: Map<roomName, Set<username>> (mutable, in-memory).
function makeAuthorization(membership) {
  function can(user, action, room, resource = {}) {
    if (!user || !user.sub || !user.role) return false;
    if (user.role === 'admin') return true;

    const inRoom = Boolean(room && membership.get(room)?.has(user.sub));

    switch (action) {
      case 'join':
        return user.role === 'guest'
          ? room === 'general' && inRoom
          : user.role === 'member' && inRoom;
      case 'send':
        return user.role === 'member' && inRoom;
      case 'create':
      case 'remove':
        return false;
      case 'delete':
        // Members may delete only their own messages.
        return user.role === 'member' && resource.owner === user.sub;
      default:
        return false;
    }
  }

  return { can };
}

module.exports = { makeAuthorization };
