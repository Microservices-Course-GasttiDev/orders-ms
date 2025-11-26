import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient, OrderStatus } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto';
import { firstValueFrom } from 'rxjs';
import { NATS_SERVICE } from 'src/config/services';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy) {
    super()
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async create(createOrderDto: CreateOrderDto) {
    try {
      //1. Check products id
      const productIds = createOrderDto.items.map((item) => item.productId);
      console.log("Get product ids:", productIds) // Remove this console.log

      const products: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds),
      );
      console.log("Get products:", products) // Remove this console.log

      //2. Calculate values
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find(
          (product) => product.id === orderItem.productId,
        ).price;
        return acc + price * orderItem.quantity;
      }, 0);
      console.log("Calculate total amount:", totalAmount) // Remove this console.log

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);
      console.log("Calculate total items:", totalItems) // Remove this console.log

      //3. Create a database entry
      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          status: OrderStatus.PENDING,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find(
                  (product) => product.id === orderItem.productId,
                ).price,
                productId: orderItem.productId.toString(),
                quantity: orderItem.quantity,
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      });
      console.log("Create order and order items:", order) // Remove this console.log

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id === Number(orderItem.productId))
            .name,
        })),
      };
    } catch (error) {
      console.log("Captured error:", error)
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Check logs for more information',
      });
    }
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const { page, limit, status } = orderPaginationDto

    const totalOrders = await this.order.count({
      where: {
        status
      }
    })
    const totalPages = Math.ceil(totalOrders / limit!)

    return {
      data: await this.order.findMany({
        where: { status },
        skip: (page! - 1) * limit!,
        take: limit
      }),
      meta: {
        totalPages: totalPages,
        page: page,
        totalOrders: totalOrders
      }
    };
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: { id },
      include: {
        OrderItem: {
          select: {
            productId: true,
            price: true,
            quantity: true
          }
        }
      }
    })

    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id ${id} not found`
      })
    }

    const productIds = order.OrderItem.map(order => order.productId)

    const products: any[] = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, productIds),
    );

    return {
      ...order,
      OrderItem: order.OrderItem.map(orderItem => ({
        ...orderItem,
        name: products.find(product => product.id === Number(orderItem.productId)).name
      }))
    }
  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;

    const order = await this.findOne(id)

    if (!order && order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id ${id} not found`
      })
    }

    return this.order.update({
      where: { id },
      data: { status: status }
    })
  }
}
