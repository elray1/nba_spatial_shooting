// import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

// this implements a straightforward SPA with state - based on
// https://dev.to/vijaypushkin/dead-simple-state-management-in-vanilla-javascript-24p0
const App = {
  state: {
    all_shots: [],
    selected_shots: [],
    chart_dims: {
      x_min: -250,
      y_min: 0,
      width: 500,
      height: 452.5,
      margin: 10
    },
    chart_scales: {}
  },
  
  /**
   * Initialize the app
   */
  async init() {
    await this.init_all_shots_data();
    this.init_select_player();
    this.update_selected_shots();
    this.init_chart();
  },
  
  /**
   * Initialize shots data in this object
   */
  async init_all_shots_data() {
    var shots = await d3.csv('data/shots.csv');

    // adjust loc_y for a more convenient orientation.
    // after this step, basketball hoop is at (0, 400)
    this.state.all_shots = shots.map((d) => { d.loc_y = 400. - d.loc_y; return d })
  },
  
  /**
   * Initialize select player drop-down menu
   */
  init_select_player() {
    const select_player = d3.select('#selectPlayer');
    
    // unique player names, sort by last name
    let player_names = _.chain(this.state.all_shots)
      .pluck('player_name')
      .uniq()
      .sortBy((n) => n.split(' ')[1])
      .value();
    
    // add as options for select player menu
    select_player.selectAll('option')
      .data(player_names)
      .join('option')
      .attr('value', (d) => d)
      .text((d) => d);
    
    select_player.on('change', this.handle_change_selected_player);
  },
  
  update_selected_shots() {
    const selected_player = d3.select('#selectPlayer').node().value;
    this.state.selected_shots = this.state.all_shots
      .filter((d) => d.player_name == selected_player);
  },
  
  init_chart() {
    // set up scales
    this.state.chart_scales
      .shot_made_color_scale = d3.scaleOrdinal(this.state.all_shots.map(d => d.shot_made_flag),
                                               ['#BC9A5C', '#008853']);
    this.state.chart_scales
      .shot_made_shape_scale = d3.scaleOrdinal(this.state.all_shots.map(d => d.shot_made_flag),
                                               d3.symbols.map(s => d3.symbol()
                                                                     .type(s)
                                                                     .size(18)()));

    // Create the SVG container.
    const chart_dims = this.state.chart_dims;
    const svg = d3.select('#plot-container').append('svg')
      .attr('viewBox', [chart_dims.x_min - chart_dims.margin,
                        chart_dims.y_min - chart_dims.margin,
                        chart_dims.width + 2*chart_dims.margin,
                        chart_dims.height + 2*chart_dims.margin])
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('style', 'max-width: 100%; max-height: 100%; height: auto;');
    
    // add group container for hexbins
    svg.append('g')
      .attr('id', 'g_hexbin_layer');
    
    // add group container for scatterplot points
    svg.append('g')
      .attr('id', 'g_scatter_layer');
    
    // draw chart
    this.draw_chart();
  },
  
  draw_chart() {
    const svg = d3.select('#plot-container svg');
    this.draw_hexbin_layer();
    this.draw_scatter_layer();
    this.draw_court(svg);
  },
  
  draw_hexbin_layer() {
    // Bin the data.
    const hexbin_width = 2; // feet
    const hexbin_radius = (hexbin_width * 10) / (2 * Math.sin(Math.PI / 3));
    const chart_dims = this.state.chart_dims;
    
    const hexbin = d3.hexbin()
      .x(d => d.loc_x)
      .y(d => d.loc_y)
      .radius(hexbin_radius)
      .extent([[chart_dims.x_min, chart_dims.y_min],
               [chart_dims.x_min + chart_dims.width, chart_dims.y_min + chart_dims.height]]);
    
    const bins = hexbin(this.state.selected_shots);
    
    const color_scale = d3.scaleSequential(d3.interpolateBuPu)
      .domain([0, d3.max(bins, d => d.length) / 2]);
      
    d3.select('#g_hexbin_layer')
      .attr("fill", "#ddd")
      .attr("stroke", "black")
      .selectAll("path")
      .data(bins)
      .join("path")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .attr("d", hexbin.hexagon())
      .attr("fill", bin => color_scale(bin.length));
  },
  
  /**
   * Add scatter plot of individual shots to the chart
   *
   * @param {Selection} svg - d3 selection of svg element containing the chart
   */
  draw_scatter_layer() {
    d3.select('#g_scatter_layer')
      .attr('stroke-width', 0.1)
      .selectAll('path')
      .data(this.state.selected_shots)
      .join('path')
      .attr('transform', d => `translate(${d.loc_x}, ${d.loc_y})`)
      .attr('fill', d => this.state.chart_scales.shot_made_color_scale(d.shot_made_flag))
      .attr('d', d => this.state.chart_scales.shot_made_shape_scale(d.shot_made_flag));
  },
  
  /**
   * Add lines indicating court boundaries, 3 point line, hoop and backboard to
   * the chart
   *
   * @param {Selection} svg - d3 selection of svg element containing the chart
   */
  draw_court(svg) {
    const {x_min, y_min, height} = this.state.chart_dims;
    const [stroke_color, stroke_width] = ['#555555', 1.25]
    
    // court edges
    const court_edges = [
      [x_min, 0],
      [x_min, y_min + height],
      [-x_min, y_min + height],
      [-x_min, 0]
    ];
  
    svg.append('path')
      .attr('d', d3.line()(court_edges))
      .attr('stroke', stroke_color)
      .attr("stroke-width", stroke_width)
      .attr('fill', 'none');
  
    // three point lines
    const three_pt_sides = [
      [
        [-220, y_min + height],
        [-220, 400 - Math.sqrt(237.5**2 - 220**2)]
      ],
      [
        [220, y_min + height],
        [220, 400 - Math.sqrt(237.5**2 - 220**2)]
      ]
    ]
  
    for (var i = 0; i < 2; i++) {
      svg.append('path')
        .attr('d', d3.line()(three_pt_sides[i]))
        .attr('stroke', stroke_color)
        .attr("stroke-width", stroke_width)
        .attr('fill', 'none');
    }
  
    const three_pt_arc_gen = d3.arc()
      .innerRadius(237.5)
      .outerRadius(237.5)
      .startAngle(-Math.PI / 2 + Math.acos(22.0 / 23.75))
      .endAngle(Math.PI / 2 - Math.acos(22.0 / 23.75));
  
    svg.append("path")
      .attr("transform", "translate(0, 400)")
      .attr("d", three_pt_arc_gen)
      .attr('stroke', stroke_color)
      .attr("stroke-width", stroke_width)
      .attr('fill', 'none');
  
    // Basketball hoop and backboard
    svg.append('circle')
      .attr('cx', 0)
      .attr('cy', 400)
      .attr('r', '7.5')
      .attr('stroke', stroke_color)
      .attr("stroke-width", stroke_width)
      .attr('fill', 'none');
  
    const backboard = [
      [-30, y_min + height - 40],
      [30, y_min + height - 40]
    ];
  
    svg.append('path')
      .attr('d', d3.line()(backboard))
      .attr('stroke', stroke_color)
      .attr("stroke-width", stroke_width)
      .attr('fill', 'none');
  },
  
  /**
   * Handle change to selected player:
   *  - update this.state.selected_shots
   *  - redraw plot
   */
  handle_change_selected_player() {
    App.update_selected_shots();
    App.draw_chart();
  }
}


await App.init();
