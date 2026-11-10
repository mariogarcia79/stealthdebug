db = db.getSiblingDB('stealthdebug');

// Indexes for query performance and uniqueness enforcement
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ name: 1 },  { unique: true });
db.users.createIndex({ role: 1 });

db.posts.createIndex({ author: 1 });
db.posts.createIndex({ published: 1 });
db.posts.createIndex({ createdAt: -1 });

db.comments.createIndex({ post: 1 });
db.comments.createIndex({ author: 1 });
db.comments.createIndex({ post: 1, published: 1, createdAt: -1 });
