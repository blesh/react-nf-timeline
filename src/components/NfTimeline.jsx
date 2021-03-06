import React, { Component, PropTypes } from 'react';
import NfTimelineRenderedEvent from './NfTimelineRenderedEvent';
import linearScale from '../util/linearScale';
import mixin from '../util/mixin';

export default class NfTimeline extends Component {
  static propTypes = {
    eventHeight: PropTypes.number,
    height: PropTypes.number.isRequired,
    data: PropTypes.array.isRequired,
    start: PropTypes.number,
    end: PropTypes.number,
    tickFormat: PropTypes.func,
    resizeThrottle: PropTypes.number
  }

  static defaultProps = {
    height: 800,
    eventHeight: 20,
    tickFormat: (tick) => tick + 'ms',
    resizeThrottle: 50
  }

  constructor(props) {
    super(props);
    const { hi, lo, treeState } = this.getTreeState(props.children);

    this.state = {
      viewportOffset: 0,
      treeState,
      hi,
      lo,
      leftWidth: 150,
      width: 800
    };
  }

  throttle(callback, limit) {
    let wait = false;
    return function () {
      if (!wait) {
        callback.call();
        wait = true;
        setTimeout(function () {
          wait = false;
        }, limit);
      }
    };
  }

  componentDidMount() {
    let self = this;
    window.addEventListener('resize', self.throttle(self.resizeHandler.bind(self), self.props.resizeThrottle));
    self.resizeHandler();
  }

  componentWillUnmount() {
    let self = this;
    window.removeEventListener('resize', self.throttle(self.resizeHandler.bind(self), self.props.resizeThrottle));
  }

  resizeHandler() {
    let width = this.refs.timeline.clientWidth;
    if (this.state.width !== width) {
      this.setState({
        width: width,
      });
    }
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.children !== this.props.children) {
      const { hi, lo, treeState } = this.getTreeState(nextProps.children);
      this.setState({
        treeState,
        hi,
        lo
      });
    }
  }

  getStartIndex(viewportOffset, eventHeight) {
    return Math.max(Math.floor(viewportOffset / eventHeight) - 1, 0);
  }

  getDisplayCount(height, eventHeight) {
    return Math.ceil(this.props.height / this.props.eventHeight) + 2;
  }


  getTreeState(children) {
    const _start = this.props.start;
    const _end = this.props.end;
    let lo = _start || null;
    let hi = _end || null;
    let counter = 0;

    const crawl = function crawl(children, treeState, parent, level) {
      const arr = React.Children.toArray(children);
      const len = arr.length;

      for (let i = 0; i < len; i++) {
        let child = arr[i];
        let { collapse, id, start, end, value, text, onClick, markerStyle } = child.props;

        if (_start === null) {
          lo = Math.min(lo, start);
        }

        if (_end === null) {
          hi = Math.max(hi, end);
        }

        let isParentCollapsed = parent && (parent.isCollapsed || parent.isParentCollapsed);
        let node = {
          isCollapsed: collapse,
          id,
          start,
          end,
          value,
          text,
          isParentCollapsed,
          children: [],
          parent,
          level,
          onClick,
          markerStyle
        };

        treeState.push(node);

        if (parent) {
          parent.children.push(node);
        }

        const startCounter = counter;
        crawl(child.props.children, treeState, node, level + 1);
        node.descendantCount = counter - startCounter;
        node.visibleChildren = node.isParentCollapsed || node.isCollapsed ? 0 : node.descendantCount;
        counter++;
      }
    };

    const treeState = [];

    crawl(children, treeState, null, 0);

    return { hi, lo, treeState };
  }

  toggleCollapse(id) {
    const state = this.state;
    const treeState = state.treeState;
    const index = treeState.findIndex(x => x.id === id);

    if (index !== -1) {
      const node = treeState[index];
      const props = this.props;

      node.isCollapsed = !node.isCollapsed;

      const collapse = (node) => {
        node.children.forEach(child => {
          child.isParentCollapsed = node.isCollapsed || node.isParentCollapsed;
          collapse(child);
        });
      };

      collapse(node);

      const updateVisibleChildren = (node, change) => {
        node.visibleChildren = node.descendantCount + change;
        if (node.parent) {
          updateVisibleChildren(node.parent, change);
        }
      };

      updateVisibleChildren(node, node.isCollapsed ? -node.descendantCount : 0);

      this.setState({
        treeState
      });
    }
  }

  getScale() {
    const { lo, hi, leftWidth, width } = this.state;
    const { start, end } = this.props;
    const domain = [start || lo, end || hi];
    const range = [0, width - leftWidth];
    console.log('domain', domain, 'range', range);
    return linearScale(domain, range);
  }

  getEvents() {
    const { hi, lo, treeState, viewportOffset, leftWidth } = this.state;
    const { height, eventHeight, start, end } = this.props;
    const displayCount = this.getDisplayCount(height, eventHeight);
    const startIndex = this.getStartIndex(viewportOffset, eventHeight);
    const len = treeState.length;
    const endIndex = startIndex + displayCount;
    const events = [];
    const toggleCollapse = ::this.toggleCollapse;
    let key = 0;

    const scale = this.getScale();
    console.log(scale(1));
    for (let i = 0, offset = 0; i < len; i++) {
      let node = treeState[i];
      if (node.isParentCollapsed) {
        offset += 1;
        continue;
      }
      const start = Math.max(0, (startIndex + offset - 4));
      const end = Math.min(len - 1, (endIndex + offset + 4));
      if (start <= i && i <= end) {
        events.push((<NfTimelineRenderedEvent
            key={key++}
            id={node.id}
            leftWidth={leftWidth}
            height={eventHeight}
            isCollapsed={node.isCollapsed}
            isParentCollapsed={node.isParentCollapsed}
            onToggleCollapse={toggleCollapse}
            start={node.start}
            end={node.end}
            value={node.value}
            onClick={node.onClick}
            hasChildren={node.children.length > 0}
            visibleChildren={node.visibleChildren}
            level={node.level}
            scale={scale}
            markerStyle={node.markerStyle} />));
      }
    }

    return events;
  }

  getViewportStyle() {
    return {
      height: this.props.height + 'px',
      width: this.state.width,
      overflowY: 'scroll'
    };
  }

  getContentStyle(total) {
    return {
      height: (this.props.eventHeight * total) + 'px'
    };
  }

  getOffsetStyle() {
    const eventHeight = this.props.eventHeight;
    const viewportOffset = this.state.viewportOffset;
    const startIndex = this.getStartIndex(viewportOffset, eventHeight);
    const offset = (startIndex * eventHeight);
    return {
      transform: `translate3d(0, ${offset}px, 0)`
    };
  }

  viewportScrolled(e) {
    const viewportOffset = e.target.scrollTop;
    const { state: { treeState, leftWidth }, props: { height, eventHeight } } = this;
    this.setState({
      viewportOffset
    });
  }

  onTimelineMouseMove(e) {
    if (this.state.resizingLeft) {
      e.preventDefault();
      const leftWidth = (e.clientX - this.refs.timeline.offsetLeft);
      this.setState({
        leftWidth
      });
    }
  }

  getLeftSizeHandleStyle() {
    return {
      width: '20px',
      height: this.props.height + 'px',
      marginLeft: '-10px',
      position: 'absolute',
      top: 0,
      left: this.state.leftWidth + 'px',
      background: 'transparent',
      cursor: this.state.resizingLeft ? 'ew-resize' : 'col-resize'
    };
  }

  startLeftResize(e) {
    e.preventDefault();
    this.setState({
      resizingLeft: true
    });
  }

  stopLeftResize(e) {
    this.setState({
      resizingLeft: false
    });
  }

  render() {
    const { treeState, leftWidth } = this.state;
    const tickFormat = this.props.tickFormat;
    const total = treeState.length;
    const events = this.getEvents();
    const contentStyle = this.getContentStyle(total);
    const viewportStyle = this.getViewportStyle();
    const offsetStyle = this.getOffsetStyle();
    const leftSizeHandleStyle = this.getLeftSizeHandleStyle();
    const tickStyle = {
      position: 'absolute',
      top: 0,
      bottom: 0,
      borderRight: '1px solid black',
      width: 0
    };

    const scale = this.getScale();

    const ticks = scale.ticks(8, tick => {
      const left = scale(tick) + leftWidth;
      let style = mixin({
        left: `${left}px`
      }, tickStyle);
      return <div style={style}/>;
    });


    const headerTicks = scale.ticks(8, tick => {
      const left = scale(tick) + leftWidth;
      let style = mixin({
        left: `${left}px`
      }, tickStyle);
      return (<div style={style}>
        <span className="nf-timeline-tick-label">{tickFormat(tick)}</span>
      </div>);
    });

    const headerStyle = {
      height: '22px'
    };

    return (<div onMouseMove={::this.onTimelineMouseMove} ref="timeline" className="nf-timeline">
      <div className="nf-timeline-header" style={headerStyle}>{headerTicks}</div>
      <div onScroll={::this.viewportScrolled} className="nf-timeline-viewport" style={viewportStyle}>
        <div className="nf-timeline-content" style={contentStyle}>
          <div className="nf-timeline-inner-offset" style={offsetStyle}>
            <div className="nf-timeline-ticks">
              {ticks}
            </div>
            {events}
          </div>
        </div>
      </div>
      <div className="nf-timeline-left-size-handle" style={leftSizeHandleStyle}
        onMouseDown={::this.startLeftResize} onMouseUp={::this.stopLeftResize}>
      </div>
    </div>);
  }
}
