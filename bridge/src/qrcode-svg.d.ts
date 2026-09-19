declare module "qrcode-svg" {
  export interface QrCodeOptions {
    content: string;
    padding?: number;
    width?: number;
    height?: number;
    color?: string;
    background?: string;
    ecl?: "L" | "M" | "Q" | "H";
    join?: boolean;
    predefined?: boolean;
    pretty?: boolean;
    swap?: boolean;
    xmlDeclaration?: boolean;
    container?: "svg" | "svg-viewbox" | "g" | "none";
  }

  export default class QRCode {
    constructor(contentOrOptions: string | QrCodeOptions);
    svg(): string;
  }
}
