const socketMap = new Map();

export const upsertUserToSocketMap = (userId, socketId) => {
  socketMap.set(userId, socketId);
};

export const removeUserFromSocketMap = (socketId) => {
  socketMap.delete(socketId);
};

export const getSocketFromId = (userId) => {
  const socket = socketMap.get(userId);
  return socket;
};

export const getSocketId = (userId) => {
  const data = socketMap.get(userId);
  if (data && data.id) {
    return data.id;
  }
  return "";
};
