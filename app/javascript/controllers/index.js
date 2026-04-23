import { application } from "./application"

import ReceiptController from "./receipt_controller"
import DropzoneController from "./dropzone_controller"
import HeicController from "./heic_controller"
import ImageCompressController from "./image_compress_controller"
import PdfController from "./pdf_controller"
import DownController from "./down_controller"
import InvoiceController from "./invoice_controller"
import MediaController from "./media_controller"
import SignController from "./sign_controller"
import UrlOpenerController from "./url_opener_controller"

application.register("receipt", ReceiptController)
application.register("dropzone", DropzoneController)
application.register("heic", HeicController)
application.register("image-compress", ImageCompressController)
application.register("pdf", PdfController)
application.register("down", DownController)
application.register("invoice", InvoiceController)
application.register("media", MediaController)
application.register("sign", SignController)
application.register("url-opener", UrlOpenerController)
