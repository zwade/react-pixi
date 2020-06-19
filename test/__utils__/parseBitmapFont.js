import { BitmapFont } from 'pixi.js'
import { emptyTexture } from '../__fixtures__/textures'

const parseBitmapFontData = (data, type = 'text/xml', texture = emptyTexture) => {
  // In JSDOM, XMLDocument is an empty class that extends Document
  // Since PIXI is looking explicitly for an XMLDocument, we need to either
  // monkey patch the prototype stack of the resulting document, or just
  // overwrite XMLDocument with Document
  global.XMLDocument = Document
  return BitmapFont.install(new window.DOMParser().parseFromString(data, type), texture)
}

export default parseBitmapFontData
