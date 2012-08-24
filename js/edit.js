(function ($) {

Drupal.edit = Drupal.edit || {};
Drupal.edit.wysiwyg = Drupal.edit.wysiwyg || {};

/**
 * Attach toggling behavior and in-place editing.
 */
Drupal.behaviors.edit = {
  attach: function(context) {
    $('#edit_view-edit-toggles').once('edit-init', Drupal.edit.init);
    $('#edit_view-edit-toggles').once('edit-toggle', Drupal.edit.toggle.render);

    // Remove URLs for the edit toggle links so we don't get redirects
    $("a.edit_view-edit-toggle").attr('href', '#');
  }
};

Drupal.edit.const = {};
Drupal.edit.const.transitionEnd = "transitionEnd.edit webkitTransitionEnd.edit transitionend.edit msTransitionEnd.edit oTransitionEnd.edit";

Drupal.edit.init = function() {
  // VIE instance for Editing
  Drupal.edit.vie = new VIE();

  Drupal.edit.state = Drupal.edit.prepareStateModel();
  Drupal.edit.state.set('queues', Drupal.edit.prepareQueues());

  // Load the storage widget to get localStorage support
  $('body').midgardStorage({
    vie: Drupal.edit.vie,
    editableNs: 'createeditable'
  });

  // Initialize WYSIWYG, if any.
  if (Drupal.settings.edit.wysiwyg) {
    $(document).bind('edit-wysiwyg-ready.edit', function() {
      Drupal.edit.state.set('wysiwygReady', true);
      console.log('edit: WYSIWYG ready');
    });
    Drupal.edit.wysiwyg[Drupal.settings.edit.wysiwyg].init();
  }

  // Create a backstage area.
  $(Drupal.theme('editBackstage', {})).appendTo('body');

  // Instantiate FieldViews
  Drupal.edit.util.findEditableFields().each(Drupal.edit.prepareFieldView);

  // Instantiate overlayview
  var overlayView = new Drupal.edit.views.OverlayView({
    state: Drupal.edit.state
  });

  // Transition between view/edit states.
  $("a.edit_view-edit-toggle").bind('click.edit', function() {
    var isViewing = $(this).hasClass('edit-view');
    Drupal.edit.state.set('isViewing', isViewing);

    // Swap active class among the two links.
    $('a.edit_view-edit-toggle').parent().removeClass('active');
    $('a.edit_view-edit-toggle.edit-' + (isViewing ? 'view' : 'edit')).parent().addClass('active');

    return false;
  });
};

Drupal.edit.prepareStateModel = function () {
  // The state of Spark Edit is handled in a Backbone model
  Drupal.edit.StateModel = Backbone.Model.extend({
    defaults: {
      isViewing: true,
      entityBeingHighlighted: [],
      fieldBeingHighlighted: [],
      fieldBeingEdited: [],
      highlightedEditable: null,
      editedEditable: null,
      queues: {},
      wysiwygReady: false
    }
  });

  // We always begin in view mode.
  return new Drupal.edit.StateModel();
};

Drupal.edit.prepareQueues = function () {
  // Form preloader.
  var queues = {
    preload: Drupal.edit.util.findEditableFields().filter('.edit-type-form').map(function () {
      return Drupal.edit.util.getID($(this));
    })
  };
  console.log('Fields with (server-generated) forms:', queues.preload);
  return queues;
};

Drupal.edit.prepareFieldView = function () {
  var fieldViewType = Drupal.edit.views.EditableFieldView;
  if (!jQuery(this).hasClass('edit-type-direct')) {
    fieldViewType = Drupal.edit.views.FormEditableFieldView;
  }

  var fieldView = new fieldViewType({
    state: Drupal.edit.state,
    el: this,
    model: Drupal.edit.util.getElementEntity(this, Drupal.edit.vie),
    predicate: Drupal.edit.util.getElementPredicate(this),
    vie: Drupal.edit.vie
  });
};

/*
Drupal.edit.decorateEditables = function($editables) {
  $editables
  .addClass('edit-animate-fast')
  .addClass('edit-candidate edit-editable')
  .bind('mouseenter.edit', function(e) {
    var $editable = $(this);
    Drupal.edit.util.ignoreHoveringVia(e, '.edit-toolbar-container', function() {
      console.log('field:mouseenter');
      if (!$editable.hasClass('edit-editing')) {
        Drupal.edit.editables.startHighlight($editable);
      }
      // Prevents the entity's mouse enter event from firing, in case their borders are one and the same.
      e.stopPropagation();
    });
  })
  .bind('mouseleave.edit', function(e) {
    var $editable = $(this);
    Drupal.edit.util.ignoreHoveringVia(e, '.edit-toolbar-container', function() {
      console.log('field:mouseleave');
      if (!$editable.hasClass('edit-editing')) {
        Drupal.edit.editables.stopHighlight($editable);
        // Leaving a field won't trigger the mouse enter event for the entity
        // because the entity contains the field. Hence, do it manually.
        var $e = Drupal.edit.util.findEntityForEditable($editable);
        Drupal.edit.entityEditables.startHighlight($e);
      }
      // Prevent triggering the entity's mouse leave event.
      e.stopPropagation();
    });
  })
  .each(function() {
    var editableView = new Drupal.edit.views.EditableView({
      model: Drupal.edit.util.getElementEntity(jQuery(this), Drupal.edit.vie),
      el: jQuery(this),
      predicate: Drupal.edit.util.getElementPredicate(jQuery(this))
    });
  })
  // Some transformations are editable-specific.
  .map(function() {
    $(this).data('edit-background-color', Drupal.edit.util.getBgColor($(this)));
  });
};

Drupal.edit.clickOverlay = function(e) {
  console.log('clicked overlay');

  if (Drupal.edit.modal.get().length == 0) {
    Drupal.edit.toolbar.get(Drupal.edit.state.get('fieldBeingEdited'))
    .find('a.close').trigger('click.edit');
  }
};
*/

/*
1. Editable Entities
2. Editable Fields (are associated with Editable Entities, but are not
   necessarily *inside* Editable Entities — e.g. title)
    -> contains exactly one Editable, in which the editing itself occurs, this
       can be either:
         a. type=direct, here some child element of the Field element is marked as editable
         b. type=form, here the field itself is marked as editable, upon edit, a form is used
*/
// Field editables.
Drupal.edit.editables = {
  /*
  startEdit: function($field) {
    $editable = Drupal.edit.util.findEditablesForFields($field);
    if ($editable.hasClass('edit-editing')) {
      return;
    }

    console.log('editables.startEdit: ', $editable);
    var self = this;

    // Highlight if not already highlighted.
    if (Drupal.edit.state.get('fieldBeingHighlighted')[0] != $editable[0]) {
      Drupal.edit.editables.startHighlight($editable);
    }

    $editable
    .addClass('edit-editing')
    .bind('edit-content-changed.edit', function(e) {
      self._buttonFieldSaveToBlue(e, $editable, $field);
    })
    // Some transformations are editable-specific.
    .map(function() {
      $(this).css('background-color', $(this).data('edit-background-color'));
    });

    // While editing, don't show *any* other field or entity as editable.
    $('.edit-candidate').not('.edit-editing').removeClass('edit-editable');
    // Hide the curtain while editing, the above already prevents comments from
    // showing up.
    Drupal.edit.util.findEntityForField($field).find('.comment-wrapper .edit-curtain').height(0);

    // Toolbar (already created in the highlight).
    Drupal.edit.toolbar.get($editable)
    .addClass('edit-editing')
    .find('.edit-toolbar.secondary:not(:has(.edit-toolgroup.ops))')
    .append(Drupal.theme('editToolgroup', {
      classes: 'ops',
      buttons: [
        { url: '#', label: Drupal.t('Save'), classes: 'field-save save gray-button' },
        { url: '#', label: '<span class="close"></span>', classes: 'field-close close gray-button' }
      ]
    }))
    .delegate('a.field-save', 'click.edit', function(e) {
      return self._buttonFieldSaveClicked(e, $editable, $field);
    })
    .delegate('a.field-close', 'click.edit', function(e) {
      return self._buttonFieldCloseClicked(e, $editable, $field);
    });

    // Start the editable widget
    $field.createEditable({disabled: false});

    // Regardless of the type, load the form for this field. We always use forms
    // to submit the changes.
    // FIXME: This should be handled by Backbone.sync
    self._loadForm($editable, $field);

    Drupal.edit.state.set('fieldBeingEdited', $editable);
    Drupal.edit.state.set('editedEditable', Drupal.edit.util.getID($field));
  },

  stopEdit: function($field) {
    $editable = Drupal.edit.util.findEditablesForFields($field);
    console.log('editables.stopEdit: ', $editable);
    var self = this;
    if ($editable.length == 0) {
      return;
    }

    $editable
    .removeClass('edit-highlighted edit-editing edit-belowoverlay')
    // Some transformations are editable-specific.
    .map(function() {
      $(this).css('background-color', '');
    });

    // Make the other fields and entities editable again.
    $('.edit-candidate').addClass('edit-editable');
    // Restore curtain to original height.
    var $curtain = Drupal.edit.util.findEntityForEditable($editable)
                   .find('.comment-wrapper .edit-curtain');
    $curtain.height($curtain.data('edit-curtain-height'));

    // Start the editable widget
    $field.createEditable({disabled: true});

    Drupal.edit.toolbar.remove($editable);
    Drupal.edit.form.remove($editable);

    Drupal.edit.state.set('fieldBeingEdited', []);
    Drupal.edit.state.set('editedEditable', null);
  },

  _loadRerenderedProcessedText: function($editable, $field) {
    // Indicate in the 'info' toolgroup that the form is loading.
    Drupal.edit.toolbar.addClass($editable, 'primary', 'info', 'loading');

    var edit_id = Drupal.edit.util.getID($field);
    var element_settings = {
      url      : Drupal.edit.util.calcRerenderProcessedTextURL(edit_id),
      event    : 'edit-internal-load-rerender.edit',
      $field   : $field,
      $editable: $editable,
      submit   : { nocssjs : true },
      progress : { type : null }, // No progress indicator.
    };
    if (Drupal.ajax.hasOwnProperty(edit_id)) {
      delete Drupal.ajax[edit_id];
      $editable.unbind('edit-internal-load-rerender.edit');
    }
    Drupal.ajax[edit_id] = new Drupal.ajax(edit_id, $editable, element_settings);
    $editable.trigger('edit-internal-load-rerender.edit');
  },

  // Attach, activate and show the WYSIWYG editor.
  _wysiwygify: function($editable) {
    $editable.addClass('edit-wysiwyg-attached');
    Drupal.edit.toolbar.show($editable, 'secondary', 'wysiwyg-tabs');
    Drupal.edit.toolbar.show($editable, 'tertiary', 'wysiwyg');
  },

  _updateDirectEditable: function($field) {
    $editable = Drupal.edit.util.findEditablesForFields($field);
    Drupal.edit.editables._padEditable($editable);

    if ($field.hasClass('edit-type-direct-with-wysiwyg')) {
      Drupal.edit.toolbar.get($editable)
      .find('.edit-toolbar.secondary:not(:has(.edit-toolgroup.wysiwyg-tabs))')
      .append(Drupal.theme('editToolgroup', {
        classes: 'wysiwyg-tabs',
        buttons: []
      }))
      .end()
      .find('.edit-toolbar.tertiary:not(:has(.edit-toolgroup.wysiwyg))')
      .append(Drupal.theme('editToolgroup', {
        classes: 'wysiwyg',
        buttons: []
      }));

      // When transformation filters have been been applied to the processed
      // text of this field, then we'll need to load a re-rendered version of
      // it without the transformation filters.
      if ($field.hasClass('edit-text-with-transformation-filters')) {
        Drupal.edit.editables._loadRerenderedProcessedText($editable, $field);
      }
      // When no transformation filters have been applied: start WYSIWYG editing
      // immediately!
      else {
        setTimeout(function() {
          Drupal.edit.editables._wysiwygify($editable);
        }, 0);
      }
    }

    $editable
    .data('edit-content-changed', false);

    $field.bind('createeditablechanged', function() {
      $editable.data('edit-content-changed', true);
      $editable.trigger('edit-content-changed.edit');
    });
  },
*/
  _loadForm: function($editable, $field) {
    var edit_id = Drupal.edit.util.getID($field);
    var element_settings = {
      url      : Drupal.edit.util.calcFormURLForField(edit_id),
      event    : 'edit-internal.edit',
      $field   : $field,
      $editable: $editable,
      submit   : { nocssjs : ($field.hasClass('edit-type-direct')) },
      progress : { type : null }, // No progress indicator.
    };
    if (Drupal.ajax.hasOwnProperty(edit_id)) {
      delete Drupal.ajax[edit_id];
      $editable.unbind('edit-internal.edit');
    }
    Drupal.ajax[edit_id] = new Drupal.ajax(edit_id, $editable, element_settings);
    $editable.trigger('edit-internal.edit');
  },
/*
  _buttonFieldSaveClicked: function(e, $editable, $field) {
    // type = form
    if ($field.hasClass('edit-type-form')) {
      Drupal.edit.form.get($field).find('form')
      .find('.edit-form-submit').trigger('click.edit').end();
    }
    // type = direct
    else if ($field.hasClass('edit-type-direct')) {
      $editable.blur();

      var entity = Drupal.edit.util.getElementEntity($field, Drupal.edit.vie);
      var value = entity.get(Drupal.edit.util.getElementPredicate($editable));

      // TODO: Use Backbone.sync so we can support the Drupal 8 API 
      // without code changes in Spark
      // entity.save();

      $('#edit_backstage form')
      .find(':input[type!="hidden"][type!="submit"]').val(value).end()
      .find('.edit-form-submit').trigger('click.edit');
    }
    return false;
  },

  _buttonFieldCloseClicked: function(e, $editable, $field) {
    if (!Drupal.edit.util.getElementEntity($field, Drupal.edit.vie).hasChanged()) {
      // Content not changed: stop editing field.
      // The view will restore contents automatically when we disable editor
      Drupal.edit.editables.stopEdit($field);
    } else {
      // Content changed: show modal.
      Drupal.edit.modal.create(
        Drupal.t('You have unsaved changes'),
        Drupal.theme('editButtons', { 'buttons' : [
          { url: '#', classes: 'gray-button discard', label: Drupal.t('Discard changes') },
          { url: '#', classes: 'blue-button save', label: Drupal.t('Save') }
        ]}),
        $editable
      );
      setTimeout(Drupal.edit.modal.show, 0);
    };
    return false;
  }
*/
};

})(jQuery);
