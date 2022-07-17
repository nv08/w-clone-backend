const socketMap = new Map();

export const upsertUserToSocketMap = (userId, socketId) => {
  socketMap.set(userId, socketId);
};

export const removeUserFromSocketMap = (socketId) => {
  socketMap.delete(socketId);
  // for (let [key, value] of socketMap.entries()) {
  //   if (value === socketId) {
  //     socketMap.delete(key);
  //   }
  // }
};

export const getSocketId = (userId) => {
  const id = socketMap.get(userId);
  return id;
};
