import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { NatsModule } from 'src/transports/nats.module';
// import { ClientsModule, Transport } from '@nestjs/microservices';
// import { NATS_SERVICE } from 'src/config/services';
// import { envs } from 'src/config';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  imports: [NatsModule]
})
export class OrdersModule { }
