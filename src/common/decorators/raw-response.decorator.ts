import { SetMetadata } from '@nestjs/common';

/** Skips TransformInterceptor's {success,data} wrapping — for routes that send a raw
 * file/body directly via @Res() (e.g. CSV/vCard exports), not a JSON API response. */
export const RAW_RESPONSE_KEY = 'rawResponse';
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
