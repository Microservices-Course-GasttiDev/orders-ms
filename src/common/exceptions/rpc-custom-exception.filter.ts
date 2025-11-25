import { Catch, ArgumentsHost, UnauthorizedException, ExceptionFilter } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RpcException } from '@nestjs/microservices';

@Catch(RpcException)
export class RpcCustomExceptionFilter implements ExceptionFilter {

    catch(exception: RpcException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const rpcError = exception.getError();

        if(
            typeof rpcError === 'object' &&
            'status' in rpcError &&
            'message' in rpcError
        ) {
            const status = rpcError.status && !isNaN(+rpcError.status) ? +rpcError.status : 400
            response.status(status).json(rpcError)
        }

        response.status(400).json({
            status: 400,
            message: rpcError
        })
    }

}
