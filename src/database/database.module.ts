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
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule { }