import * as Handlebars from 'handlebars';
import { MailerOptions, TemplateAdapter } from '@nestjs-modules/mailer';

export class HandlebarsAdapter implements TemplateAdapter {
  compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    const template = mail.data.html || '';
    const compiled = Handlebars.compile(template);
    mail.data.html = compiled(mail.data.context);
    callback();
  }
}