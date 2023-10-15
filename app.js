// this implements a SPA with state - based on
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
      margin: 12
    },
    chart_scales: {
      shot_made_color_scale: d3.scaleOrdinal([0, 1], ['#BC9A5C', '#008853']),
      shot_made_shape_scale_small: d3.scaleOrdinal([0, 1], [d3.symbol(d3.symbolCircle, 18)(),
                                                            d3.symbol(d3.symbolCross, 18)()]),
      shot_made_shape_scale_large: d3.scaleOrdinal([0, 1], [d3.symbol(d3.symbolCircle, 36)(),
                                                            d3.symbol(d3.symbolCross, 36)()]),
      }
  },
  
  /**
   * Initialize the app
   */
  async init() {
    await this.init_all_shots_data();
    this.init_ui();
    this.update_selected_shots();
    this.init_chart();
  },
  
  /**
   * Initialize shots data in this object
   */
  async init_all_shots_data() {
    var shots = await d3.csv('data/shots.csv');

    // make 2 adjustments to data:
    // 1) adjust loc_y for a more convenient orientation.
    //    after this step, basketball hoop is centered at (0, 400)
    // 2) add a field with numeric shot value
    // note: for efficiency, should move these computations to csv production
    function update_datum(d) {
      d.loc_y = 400. - d.loc_y;
      d.shot_value = Number(d.shot_type[0]);
      return d;
    }
    this.state.all_shots = shots.map(update_datum);
  },
  
  /**
   * Initialize the UI
   */
  init_ui() {
    this.init_select_player();
    
    // add points to label for show points checkbox
    d3.select('#labelCheckShowPointsSVG')
      .attr('stroke-width', 0.1)
      .selectAll('path')
      .data([0.0, 1.0])
      .join('path')
      .attr('transform', d => `translate(${10 + 20*d}, 10)`)
      .attr('fill', d => this.state.chart_scales.shot_made_color_scale(d))
      .attr('d', d => this.state.chart_scales.shot_made_shape_scale_large(d));
    
    // add hexbin to label for show summaries checkbox
    const hexbin = d3.hexbin()
      .radius(10);
    d3.select('#labelCheckShowSummariesSVG')
      .attr("fill", "#ddd")
      .attr("stroke", "black")
      .selectAll("path")
      .data([0])
      .join("path")
      .attr("transform", 'translate(20, 10)')
      .attr("d", hexbin.hexagon())
      .attr('fill', 'rgb(140, 131, 189)')

    // add event handlers
    d3.select('#checkShowPoints')
      .on('change', this.handle_change_show_points);
    d3.select('#checkShowHexbin')
      .on('change', this.handle_change_show_hexbin);
    d3.select('#selectMetric')
      .on('change', this.handle_change_select_metric);
    d3.select('#rangeBinWidth')
      .on('change', this.handle_change_bin_width);
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
    if(document.getElementById('checkShowHexbin').checked) {
      this.draw_hexbin_layer();
    }
    
    if(document.getElementById('checkShowPoints').checked) {
      this.draw_scatter_layer();
    }
    this.draw_court(svg);
  },
  
  draw_hexbin_layer() {
    // Bin the data.
    const hexbin_width = Number(document.getElementById('rangeBinWidth').value); // feet
    const hexbin_radius = (hexbin_width * 10) / (2 * Math.sin(Math.PI / 3));
    const chart_dims = this.state.chart_dims;
    
    // hexbin object
    // note: we could save this in the app state and update it only when th
    // radius selection changes
    const hexbin = d3.hexbin()
      .x(d => d.loc_x)
      .y(d => d.loc_y)
      .radius(hexbin_radius)
      .extent([[chart_dims.x_min, chart_dims.y_min],
               [chart_dims.x_min + chart_dims.width, chart_dims.y_min + chart_dims.height]]);
    
    // binned data values
    // note: we could save this in the app state and update it only when the
    // hexbin object changes or the selected shots changes
    const bins = hexbin(this.state.selected_shots);
    
    // function to compute metric value on bin data
    const metric = d3.select('#selectMetric').property('value');
    if(metric == 'Shot count') {
      var metric_fn = function(bin) {
        return bin.length;
      };
    } else if (metric == 'Shooting percentage') {
      var metric_fn = function(bin) {
        return d3.sum(bin, (d) => d.shot_made_flag) / bin.length;
      };
    } else if (metric == 'Points per shot') {
      var metric_fn = function(bin) {
        return d3.sum(bin, (d) => d.shot_made_flag * d.shot_value) / bin.length;
      };
    }
    const color_scale = d3.scaleSequential(d3.interpolateBuPu)
      .domain([0, d3.max(bins, metric_fn) * 0.75]);
      
    d3.select('#g_hexbin_layer')
      .attr("fill", "#ddd")
      .attr("stroke", "black")
      .selectAll("path")
      .data(bins)
      .join("path")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .attr("d", hexbin.hexagon())
      .attr("fill", d => color_scale(metric_fn(d)));
  },
  
  /**
   * Add scatter plot of individual shots to the chart
   */
  draw_scatter_layer() {
    d3.select('#g_scatter_layer')
      .attr('stroke-width', 0.1)
      .selectAll('path')
      .data(this.state.selected_shots)
      .join('path')
      .attr('transform', d => `translate(${d.loc_x}, ${d.loc_y})`)
      .attr('fill', d => this.state.chart_scales.shot_made_color_scale(d.shot_made_flag))
      .attr('d', d => this.state.chart_scales.shot_made_shape_scale_small(d.shot_made_flag));
  },
  
  /**
   * Add lines indicating court boundaries, 3 point line, hoop and backboard to
   * the chart
   *
   * @param {Selection} svg - d3 selection of svg element containing the chart
   */
  draw_court(svg) {
    const {x_min, y_min, height} = this.state.chart_dims;
    const [stroke_color, stroke_width] = ['#555555', 2]
    
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
    // subtracting 0.25 is a fudge factor to hide a gap in the angled join
    // between the sides and the arc
    const three_pt_sides = [
      [
        [-220, y_min + height],
        [-220, 400 - Math.sqrt(237.5**2 - 220**2) - 0.25]
      ],
      [
        [220, y_min + height],
        [220, 400 - Math.sqrt(237.5**2 - 220**2) - 0.25]
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
   * Handle change to selected player
   */
  handle_change_selected_player() {
    App.update_selected_shots();
    App.draw_chart();
  },
  
  /**
   * Handle change to show points checkbox
   */
  handle_change_show_points() {
    if(document.getElementById('checkShowPoints').checked) {
      App.draw_scatter_layer();
    } else {
      d3.select('#g_scatter_layer')
        .selectAll('path')
        .remove();
    }
  },
  
  /**
   * Handle change to show hex summaries checkbox
   */
  handle_change_show_hexbin() {
    if(document.getElementById('checkShowHexbin').checked) {
      d3.select('#labelSelectMetric').classed('text-black-50', false);
      document.getElementById('selectMetric').disabled = false;
      d3.select('#labelRangeBinWidth').classed('text-black-50', false);
      document.getElementById('rangeBinWidth').disabled = false;

      App.draw_hexbin_layer();
    } else {
      d3.select('#labelSelectMetric').classed('text-black-50', true);
      document.getElementById('selectMetric').disabled = true;
      d3.select('#labelRangeBinWidth').classed('text-black-50', true);
      document.getElementById('rangeBinWidth').disabled = true;

      d3.select('#g_hexbin_layer')
        .selectAll('path')
        .remove();
    }
  },
  
  /**
   * Handle change to summary metric selection
   */
  handle_change_select_metric() {
    if(document.getElementById('checkShowHexbin').checked) {
      App.draw_hexbin_layer();
    }
  },
  
  /**
   * Handle change to hex bin width
   */
  handle_change_bin_width() {
    d3.select('#labelRangeBinWidth')
      .text(`Summary bin width: ${Number(document.getElementById('rangeBinWidth').value)} feet`);
    if(document.getElementById('checkShowHexbin').checked) {
      App.draw_hexbin_layer();
    }
  }
}


await App.init();
