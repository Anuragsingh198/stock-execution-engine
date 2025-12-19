import { FastifyReply } from 'fastify';

export function handleRouteError(error: any, reply: FastifyReply, defaultMessage: string = 'Internal server error'): void {
  if (error.name === 'ZodError') {
    reply.code(400).send({
      success: false,
      error: 'Validation error',
      details: error.errors,
    });
    return;
  }

  console.error(defaultMessage, error);
  reply.code(500).send({
    success: false,
    error: 'Internal server error',
    message: error.message || defaultMessage,
  });
}
