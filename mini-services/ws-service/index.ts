import { Server } from 'socket.io';

const io = new Server(3002, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Track job subscriptions
const jobRooms = new Map<string, Set<string>>();

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // Subscribe to a specific job
  socket.on('subscribe:job', (jobId: string) => {
    socket.join(`job:${jobId}`);
    if (!jobRooms.has(jobId)) jobRooms.set(jobId, new Set());
    jobRooms.get(jobId)!.add(socket.id);
    console.log(`[WS] ${socket.id} subscribed to job ${jobId}`);
  });

  // Unsubscribe from a job
  socket.on('unsubscribe:job', (jobId: string) => {
    socket.leave(`job:${jobId}`);
    jobRooms.get(jobId)?.delete(socket.id);
  });

  // Subscribe to all job updates
  socket.on('subscribe:all', () => {
    socket.join('all-jobs');
    console.log(`[WS] ${socket.id} subscribed to all jobs`);
  });

  // Broadcast pipeline update to all subscribers
  socket.on('pipeline:update', (data: { jobId: string; type: string; [key: string]: unknown }) => {
    io.to(`job:${data.jobId}`).emit('pipeline:update', data);
    io.to('all-jobs').emit('pipeline:update', data);
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
    // Clean up subscriptions
    for (const [jobId, sockets] of jobRooms) {
      sockets.delete(socket.id);
      if (sockets.size === 0) jobRooms.delete(jobId);
    }
  });
});

console.log('[WS] WebSocket service running on port 3002');