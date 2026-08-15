import { BadRequestException } from '@nestjs/common';
import { TrainingSourceType } from '@prisma/client';

const EXTENSION_TO_TYPE: Record<string, TrainingSourceType> = {
  pdf: TrainingSourceType.PDF,
  doc: TrainingSourceType.DOC,
  docx: TrainingSourceType.DOCX,
  txt: TrainingSourceType.TXT,
  csv: TrainingSourceType.CSV,
};

export function resolveTrainingSourceType(fileName: string): TrainingSourceType {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const type = EXTENSION_TO_TYPE[ext];
  if (!type) {
    throw new BadRequestException('Unsupported file type. Please upload a PDF, DOCX, TXT or CSV file.');
  }
  return type;
}

/**
 * Extracts plain text from an uploaded business document so it can be stored
 * and later structured into BusinessKnowledge (spec §10, §11). Legacy .doc
 * (pre-2007 binary Word format) has no reliable pure-JS parser, so we ask the
 * client to convert to .docx or paste the content as text instead.
 */
export async function extractDocumentText(buffer: Buffer, type: TrainingSourceType): Promise<string> {
  switch (type) {
    case TrainingSourceType.PDF: {
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(buffer);
      return result.text;
    }
    case TrainingSourceType.DOCX: {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case TrainingSourceType.TXT:
    case TrainingSourceType.CSV:
      return buffer.toString('utf-8');
    case TrainingSourceType.DOC:
      throw new BadRequestException(
        'Legacy .doc files are not supported — please save as .docx or paste the content as text training instead.',
      );
    default:
      throw new BadRequestException('Unsupported file type.');
  }
}
