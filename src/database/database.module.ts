import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'), // Fetch the URI from environment variables
        retryWrites: true, // Ensure retryWrites is enabled for transactions
        w: 'majority', // Write concern for transactions
        serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds if MongoDB is unreachable
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        connectTimeoutMS: 10000, // Timeout after 10 seconds for initial connection
        maxPoolSize: 10, // Limit the number of connections in the pool
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule { }