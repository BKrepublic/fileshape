#include <stdint.h>
#include <string.h>

#include "zlib.h"

#define FILESHAPE_ZLIB_OK 0
#define FILESHAPE_ZLIB_INVALID_ARGUMENT 1
#define FILESHAPE_ZLIB_CAPACITY 2
#define FILESHAPE_ZLIB_INIT 3
#define FILESHAPE_ZLIB_DEFLATE 4
#define FILESHAPE_ZLIB_END 5
#define FILESHAPE_ZLIB_OUTPUT_WINDOW 16384U

static int fileshape_range_is_valid(uint32_t pointer, uint32_t length) {
  return pointer != 0U || length == 0U
    ? length <= UINT32_MAX - pointer
    : 0;
}

uint32_t fileshape_zlib_bound(uint32_t source_length) {
  const uLong bound = compressBound((uLong)source_length);
  if (bound == 0UL || bound > (uLong)UINT32_MAX) return 0U;
  return (uint32_t)bound;
}

int32_t fileshape_zlib_deflate(
  const uint8_t *source,
  uint32_t source_length,
  uint8_t *destination,
  uint32_t destination_capacity,
  uint32_t *destination_length
) {
  if (destination_length == NULL) return FILESHAPE_ZLIB_INVALID_ARGUMENT;
  *destination_length = 0U;
  if ((source == NULL && source_length != 0U) ||
      (destination == NULL && destination_capacity != 0U) ||
      !fileshape_range_is_valid((uint32_t)(uintptr_t)source, source_length) ||
      !fileshape_range_is_valid((uint32_t)(uintptr_t)destination, destination_capacity) ||
      !fileshape_range_is_valid((uint32_t)(uintptr_t)destination_length, sizeof(*destination_length))) {
    return FILESHAPE_ZLIB_INVALID_ARGUMENT;
  }

  z_stream stream;
  memset(&stream, 0, sizeof(stream));
  const int init_status = deflateInit2(
    &stream,
    Z_DEFAULT_COMPRESSION,
    Z_DEFLATED,
    15,
    8,
    Z_DEFAULT_STRATEGY
  );
  if (init_status != Z_OK) return FILESHAPE_ZLIB_INIT;

  stream.next_in = (Bytef *)source;
  stream.avail_in = (uInt)source_length;
  uint32_t produced = 0U;
  int32_t status = FILESHAPE_ZLIB_OK;
  for (;;) {
    uint8_t output_window[FILESHAPE_ZLIB_OUTPUT_WINDOW];
    stream.next_out = output_window;
    stream.avail_out = FILESHAPE_ZLIB_OUTPUT_WINDOW;
    const int deflate_status = deflate(&stream, Z_FINISH);
    const uint32_t written = FILESHAPE_ZLIB_OUTPUT_WINDOW - stream.avail_out;
    if (written > destination_capacity - produced) {
      status = FILESHAPE_ZLIB_CAPACITY;
      break;
    }
    if (written != 0U) {
      memcpy(destination + produced, output_window, written);
      produced += written;
    }
    if (deflate_status == Z_STREAM_END) break;
    if (deflate_status != Z_OK) {
      status = FILESHAPE_ZLIB_DEFLATE;
      break;
    }
  }

  const int end_status = deflateEnd(&stream);
  if (status != FILESHAPE_ZLIB_OK) return status;
  if (end_status != Z_OK) return FILESHAPE_ZLIB_END;
  *destination_length = produced;
  return FILESHAPE_ZLIB_OK;
}
