const fp = require('fastify-plugin');

module.exports = fp(async function (fastify, opts) {
  await fastify.register(require('@fastify/jwt'), {
    secret: process.env.AUTH_JWT_SECRET || 'latezza-default-secret-change-me'
  });

  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { password } = request.body;
    const expected = process.env.DASHBOARD_PASSWORD;

    if (!expected) {
      reply.status(500).send({ error: 'Server Error', message: 'DASHBOARD_PASSWORD belum dikonfigurasi.' });
      return;
    }

    if (password !== expected) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Password salah.' });
      return;
    }

    const token = fastify.jwt.sign({ sub: 'admin', role: 'admin' }, { expiresIn: '7d' });
    return { status: 'success', token };
  });

  fastify.get('/api/auth/verify', {
    preHandler: [(request, reply) => request.jwtVerify().catch(() => reply.status(401).send({ error: 'Unauthorized', message: 'Token tidak valid atau sudah kedaluwarsa.' }))]
  }, async (request, reply) => {
    return { status: 'success', user: request.user };
  });
});
