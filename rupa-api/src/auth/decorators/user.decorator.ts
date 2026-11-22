import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): Express.User & { id: string } => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
