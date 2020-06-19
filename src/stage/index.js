import React from 'react'
import { Application, InteractionManager } from 'pixi.js'
import PropTypes from 'prop-types'
import invariant from 'fbjs/lib/invariant'
import { PROPS_DISPLAY_OBJECT } from '../utils/props'
import { PixiFiber } from '../reconciler'
import { injectDevtools } from '../render'
import { AppProvider } from './provider'

const noop = () => {}

/**
 * -------------------------------------------
 * Stage React Component (use this in react-dom)
 *
 * @usage
 *
 * const App = () => (
 *   <Stage
 *     width={500}
 *     height={500}
 *     options={ backgroundColor: 0xff0000 }
 *     onMount={( renderer, canvas ) => {
 *       console.log('PIXI renderer: ', renderer)
 *       console.log('Canvas element: ', canvas)
 *     }}>
 * );
 *
 * -------------------------------------------
 */

const propTypes = {
  // dimensions
  width: PropTypes.number,
  height: PropTypes.number,

  // will return renderer
  onMount: PropTypes.func,
  onUnmount: PropTypes.func,

  // run ticker at start?
  raf: PropTypes.bool,

  // render component on component lifecycle changes?
  renderOnComponentChange: PropTypes.bool,

  children: PropTypes.node,

  // PIXI options, see http://pixijs.download/dev/docs/PIXI.Application.html
  options: PropTypes.shape({
    autoStart: PropTypes.bool,
    width: PropTypes.number,
    height: PropTypes.number,
    transparent: PropTypes.bool,
    autoDensity: PropTypes.bool,
    antialias: PropTypes.bool,
    preserveDrawingBuffer: PropTypes.bool,
    resolution: PropTypes.number,
    forceCanvas: PropTypes.bool,
    backgroundColor: PropTypes.number,
    clearBeforeRender: PropTypes.bool,
    powerPreference: PropTypes.string,
    forceFXAA: PropTypes.bool,
    sharedTicker: PropTypes.bool,
    sharedLoader: PropTypes.bool,

    // resizeTo needs to be a window or HTMLElement
    resizeTo: (props, propName, componentName) => {
      const el = props[propName]
      invariant(
        el !== window && !(el instanceof HTMLElement),
        `Invalid prop \`resizeTo\` of type ${typeof el}, expect \`window\` or an \`HTMLElement\`.`
      )
    },

    // view is optional, use if provided
    view: (props, propName, componentName) => {
      const el = props[propName]
      if (el === undefined) {
        return
      }
      invariant(
        el instanceof HTMLCanvasElement,
        `Invalid prop \`view\` of type ${typeof el}, supplied to ${componentName}, expected \`<canvas> Element\``
      )
    },
  }),
}

const defaultProps = {
  width: 800,
  height: 600,
  onMount: noop,
  onUnmount: noop,
  raf: true,
  renderOnComponentChange: true,
}

const hasAutoDensity = dens => dens !== false

export function getCanvasProps(props) {
  const reserved = [...Object.keys(propTypes), ...Object.keys(PROPS_DISPLAY_OBJECT)]

  return Object.keys(props)
    .filter(p => !reserved.includes(p))
    .reduce((all, prop) => ({ ...all, [prop]: props[prop] }), {})
}

class Stage extends React.Component {
  _canvas = null
  _mediaQuery = null
  app = null

  componentDidMount() {
    const { onMount, width, height, options, raf, renderOnComponentChange } = this.props

    this.app = new Application({
      width,
      height,
      view: this._canvas,
      ...options,
      autoDensity: false,
    })

    this.app.ticker.autoStart = false
    this.app.ticker[raf ? 'start' : 'stop']()

    this.mountNode = PixiFiber.createContainer(this.app.stage)
    PixiFiber.updateContainer(this.getChildren(), this.mountNode, this)

    injectDevtools()

    onMount(this.app)

    if (hasAutoDensity(options?.autoDensity) && window.matchMedia && !options?.resolution) {
      this._mediaQuery = window.matchMedia(`
        (-webkit-min-device-pixel-ratio: 1.3),
        (min-resolution: 120dpi)
      `)
      this._mediaQuery.addListener(this.updateSize)
    }

    if (renderOnComponentChange && !raf) {
      // listen for reconciler changes
      window.addEventListener('__REACT_PIXI_REQUEST_RENDER__', this.renderStage)
    }

    this.updateSize()
    this.renderStage()
  }

  componentDidUpdate(prevProps, prevState, prevContext) {
    const { width, height, raf, renderOnComponentChange, options } = this.props

    // update resolution
    if (options?.resolution && prevProps?.options.resolution !== options?.resolution) {
      this.app.renderer.resolution = options.resolution
      this.resetInteractionManager()
    }

    // update size
    if (
      prevProps.height !== height ||
      prevProps.width !== width ||
      prevProps.options?.resolution !== options?.resolution
    ) {
      this.updateSize()
    }

    // handle raf change
    if (prevProps.raf !== raf) {
      this.app.ticker[raf ? 'start' : 'stop']()
    }

    // flush fiber
    PixiFiber.updateContainer(this.getChildren(), this.mountNode, this)

    if (
      prevProps.width !== width ||
      prevProps.height !== height ||
      prevProps.raf !== raf ||
      prevProps.renderOnComponentChange !== renderOnComponentChange ||
      prevProps.options !== options
    ) {
      this.renderStage()
    }
  }

  updateSize = () => {
    const { width, height, options } = this.props

    if (!options?.resolution) {
      this.app.renderer.resolution = window.devicePixelRatio
      this.resetInteractionManager()
    }

    this.app.renderer.resize(width, height)

    if (hasAutoDensity(options?.autoDensity)) {
      this.app.view.style.width = width + 'px'
      this.app.view.style.height = height + 'px'
    }
  }

  renderStage = () => {
    const { renderOnComponentChange, raf } = this.props
    if (!raf && renderOnComponentChange) {
      this.app.renderer.render(this.app.stage)
    }
  }

  resetInteractionManager() {
    this.app.renderer.plugins.interaction.destroy()
    this.app.renderer.plugins.interaction = new InteractionManager(this.app.renderer)
  }

  getChildren() {
    const { children } = this.props
    return <AppProvider value={this.app}>{children}</AppProvider>
  }

  componentDidCatch(error, errorInfo) {
    console.error(`Error occurred in \`Stage\`.`)
    console.error(error)
    console.error(errorInfo)
  }

  componentWillUnmount() {
    this.props.onUnmount(this.app)

    window.removeEventListener('__REACT_PIXI_REQUEST_RENDER__', this.renderStage)

    PixiFiber.updateContainer(null, this.mountNode, this)

    if (this._mediaQuery) {
      this._mediaQuery.removeListener(this.updateSize)
      this._mediaQuery = null
    }

    this.renderStage()
    this.app.destroy()
  }

  render() {
    const { options } = this.props

    if (options && options.view) {
      invariant(options.view instanceof HTMLCanvasElement, 'options.view needs to be a `HTMLCanvasElement`')
      return null
    }

    return <canvas {...getCanvasProps(this.props)} ref={c => (this._canvas = c)} />
  }
}

Stage.propTypes = propTypes
Stage.defaultProps = defaultProps

export default Stage
