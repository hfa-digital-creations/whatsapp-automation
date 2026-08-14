import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TrainingService } from './training.service';
import { CreateTextTrainingDto } from './dto/create-text-training.dto';
import { UpdateTextTrainingDto } from './dto/update-text-training.dto';

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'csv'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

@Controller('client/training')
@Roles(UserRole.CLIENT)
@UseGuards(FeatureGuard)
@RequireFeature('TRAINING')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.trainingService.list(user.clientId!);
  }

  @Get('knowledge')
  knowledge(@CurrentUser() user: AuthenticatedUser) {
    return this.trainingService.getKnowledge(user.clientId!);
  }

  @Post('text')
  createText(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTextTrainingDto) {
    return this.trainingService.createText(user.clientId!, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTextTrainingDto) {
    return this.trainingService.update(user.clientId!, id, dto);
  }

  @Post('document')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        const ext = file.originalname.split('.').pop()?.toLowerCase();
        if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
          return callback(new BadRequestException('Unsupported file type. Allowed: PDF, DOC, DOCX, TXT, CSV.'), false);
        }
        callback(null, true);
      },
    }),
  )
  uploadDocument(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.trainingService.uploadDocument(user.clientId!, file);
  }

  @Post(':id/reprocess')
  reprocess(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.trainingService.reprocess(user.clientId!, id);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.trainingService.delete(user.clientId!, id);
  }
}
