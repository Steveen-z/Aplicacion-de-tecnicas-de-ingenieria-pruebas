import { Global, Module } from '@nestjs/common';
import { SesionWebService } from './sesion-web.service';

@Global()
@Module({
  providers: [SesionWebService],
  exports: [SesionWebService],
})
export class SeguridadWebModule {}
